import { randomUUID } from 'node:crypto';

import type { AuthSessionSummary, AuthTokensResponse } from '@onyx/contracts';
import mongoose from 'mongoose';

import { AppError, AuthenticationError, NotFoundError } from '../../../app/errors/app-error.js';
import type { AuditWriter } from '../../audit/application/audit-writer.js';
import type { FailedLoginPolicy, PrincipalResolver, UserRepository } from './auth-records.js';
import type { AccessTokenService } from '../infrastructure/access-token-service.js';
import type { CredentialCrypto } from '../infrastructure/credential-crypto.js';
import type { MongoSessionRepository } from '../infrastructure/mongo-session-repository.js';
import type { PasswordService } from '../infrastructure/password-service.js';

export interface RequestSecurityContext {
  deviceLabel: string;
  fingerprintHash: string;
  ipHash: string;
  requestId: string;
}

export interface IssuedAuthentication extends AuthTokensResponse {
  refreshToken: string;
}

interface AuthenticationOptions {
  failedLoginPolicy: FailedLoginPolicy;
  refreshGraceSeconds: number;
  refreshTtlSeconds: number;
}

export class AuthenticationService {
  readonly #accessTokens: AccessTokenService;
  readonly #audit: AuditWriter;
  readonly #crypto: CredentialCrypto;
  readonly #options: AuthenticationOptions;
  readonly #passwords: PasswordService;
  readonly #principals: PrincipalResolver;
  readonly #sessions: MongoSessionRepository;
  readonly #users: UserRepository;

  public constructor(dependencies: {
    accessTokens: AccessTokenService;
    audit: AuditWriter;
    crypto: CredentialCrypto;
    options: AuthenticationOptions;
    passwords: PasswordService;
    principals: PrincipalResolver;
    sessions: MongoSessionRepository;
    users: UserRepository;
  }) {
    this.#accessTokens = dependencies.accessTokens;
    this.#audit = dependencies.audit;
    this.#crypto = dependencies.crypto;
    this.#options = dependencies.options;
    this.#passwords = dependencies.passwords;
    this.#principals = dependencies.principals;
    this.#sessions = dependencies.sessions;
    this.#users = dependencies.users;
  }

  public async login(
    identifier: string,
    password: string,
    context: RequestSecurityContext,
  ): Promise<IssuedAuthentication> {
    const now = new Date();
    const user = await this.#users.findForLogin(identifier);
    const validPassword = await this.#passwords.verifyForLogin(
      user?.passwordHash ?? null,
      password,
    );

    if (user === null || !validPassword) {
      if (user !== null) {
        const result = await this.#users.recordFailedLogin(
          user.id,
          now,
          this.#options.failedLoginPolicy,
        );
        if (result.locked) {
          await this.#audit.append({
            action: 'ACCOUNT_TEMPORARILY_LOCKED',
            actorType: 'SYSTEM',
            outcome: 'SUCCESS',
            requestId: context.requestId,
            targetId: user.id,
            targetType: 'User',
          });
        }
      }
      throw new AuthenticationError('The credentials are invalid.', 'INVALID_CREDENTIALS');
    }

    if (user.lockedUntil !== undefined && user.lockedUntil > now) {
      throw new AuthenticationError('The account is temporarily locked.', 'ACCOUNT_LOCKED');
    }
    if (user.accountStatus !== 'ACTIVE') {
      throw new AuthenticationError('The account is unavailable.', 'ACCOUNT_UNAVAILABLE');
    }

    if (this.#passwords.needsRehash(user.passwordHash)) {
      await this.#users.replacePasswordHash(user.id, await this.#passwords.hash(password));
    }

    const credential = this.#crypto.createRefreshCredential();
    const csrfNonce = this.#crypto.createOpaqueValue();
    const expiresAt = new Date(now.getTime() + this.#options.refreshTtlSeconds * 1_000);
    await this.#sessions.create({
      csrfNonce,
      currentTokenHash: this.#crypto.hash(credential.token, 'refresh'),
      deviceLabel: context.deviceLabel,
      expiresAt,
      familyId: randomUUID(),
      fingerprintHash: context.fingerprintHash,
      ipHash: context.ipHash,
      now,
      sessionId: credential.sessionId,
      userId: user.id,
    });
    await this.#users.markLoginSuccessful(user.id, now);

    return this.#issueAuthentication(user.id, credential.sessionId, credential.token, csrfNonce);
  }

  public async issueCsrf(refreshToken: string | undefined): Promise<{ csrfToken: string }> {
    const credential = this.#crypto.parseRefreshCredential(refreshToken);
    if (credential === null) {
      throw new AuthenticationError();
    }
    const session = await this.#sessions.findActive(credential.sessionId);
    if (session === null || session.expiresAt <= new Date()) {
      throw new AuthenticationError();
    }
    const tokenHash = this.#crypto.hash(credential.token, 'refresh');
    const current = this.#crypto.equals(tokenHash, session.currentTokenHash);
    const previous =
      session.previousTokenHash !== undefined &&
      session.previousTokenValidUntil !== undefined &&
      session.previousTokenValidUntil > new Date() &&
      this.#crypto.equals(tokenHash, session.previousTokenHash);
    if (!current && !previous) {
      throw new AuthenticationError();
    }
    return { csrfToken: this.#crypto.deriveCsrfToken(session.sessionId, session.csrfNonce) };
  }

  public async refresh(
    refreshToken: string | undefined,
    csrfToken: string | undefined,
    context: RequestSecurityContext,
  ): Promise<IssuedAuthentication> {
    const credential = this.#crypto.parseRefreshCredential(refreshToken);
    if (credential === null) {
      throw new AuthenticationError();
    }
    const now = new Date();
    const session = await this.#sessions.findActive(credential.sessionId);
    if (session === null || session.expiresAt <= now) {
      throw new AuthenticationError('The session is unavailable.', 'SESSION_REVOKED');
    }
    this.#assertCsrf(session.sessionId, session.csrfNonce, csrfToken);

    const presentedHash = this.#crypto.hash(credential.token, 'refresh');
    if (this.#crypto.equals(presentedHash, session.currentTokenHash)) {
      const replacement = this.#crypto.createRefreshCredential(session.sessionId);
      const rotated = await this.#sessions.rotateCurrent({
        currentTokenHash: presentedHash,
        graceUntil: new Date(now.getTime() + this.#options.refreshGraceSeconds * 1_000),
        newTokenHash: this.#crypto.hash(replacement.token, 'refresh'),
        now,
        sessionId: session.sessionId,
      });
      if (rotated !== null) {
        return this.#issueAuthentication(
          session.userId,
          session.sessionId,
          replacement.token,
          session.csrfNonce,
        );
      }
    }

    const latest = await this.#sessions.findActive(session.sessionId);
    if (
      latest?.previousTokenHash !== undefined &&
      this.#crypto.equals(presentedHash, latest.previousTokenHash)
    ) {
      const benignConcurrentUse =
        latest.previousTokenValidUntil !== undefined &&
        latest.previousTokenValidUntil >= now &&
        this.#crypto.equals(latest.fingerprintHash, context.fingerprintHash);
      if (benignConcurrentUse) {
        throw new AppError('Another request already refreshed this session. Retry once.', {
          code: 'AUTH_REFRESH_RETRY',
          details: { retryAfterMilliseconds: 150 },
          statusCode: 409,
        });
      }

      await mongoose.connection.transaction(async (mongoSession) => {
        await this.#sessions.markReplay(session.sessionId, now, mongoSession);
        await this.#audit.append(
          {
            action: 'AUTH_REFRESH_REPLAY_DETECTED',
            actorSessionId: session.sessionId,
            actorType: 'SYSTEM',
            outcome: 'SUCCESS',
            requestId: context.requestId,
            targetId: session.sessionId,
            targetType: 'AuthSession',
          },
          mongoSession,
        );
      });
      throw new AuthenticationError('The session was revoked.', 'SESSION_REVOKED');
    }

    throw new AuthenticationError();
  }

  public async logout(
    refreshToken: string | undefined,
    csrfToken: string | undefined,
    requestId: string,
  ): Promise<void> {
    const credential = this.#crypto.parseRefreshCredential(refreshToken);
    if (credential === null) {
      return;
    }
    const session = await this.#sessions.findActive(credential.sessionId);
    if (session === null) {
      return;
    }
    const presentedHash = this.#crypto.hash(credential.token, 'refresh');
    const validCurrent = this.#crypto.equals(presentedHash, session.currentTokenHash);
    const validPrevious =
      session.previousTokenHash !== undefined &&
      session.previousTokenValidUntil !== undefined &&
      session.previousTokenValidUntil > new Date() &&
      this.#crypto.equals(presentedHash, session.previousTokenHash);
    if (!validCurrent && !validPrevious) {
      return;
    }
    this.#assertCsrf(session.sessionId, session.csrfNonce, csrfToken);
    await mongoose.connection.transaction(async (mongoSession) => {
      const changed = await this.#sessions.revoke(
        session.sessionId,
        'USER_LOGOUT',
        new Date(),
        mongoSession,
      );
      if (changed) {
        await this.#audit.append(
          {
            action: 'AUTH_SESSION_REVOKED',
            actorSessionId: session.sessionId,
            actorType: 'USER',
            actorUserId: new mongoose.Types.ObjectId(session.userId),
            outcome: 'SUCCESS',
            requestId,
            targetId: session.sessionId,
            targetType: 'AuthSession',
          },
          mongoSession,
        );
      }
    });
  }

  public listSessions(userId: string, currentSessionId: string): Promise<AuthSessionSummary[]> {
    return this.#sessions.list(userId, currentSessionId, new Date());
  }

  public async revokeSession(
    userId: string,
    currentSessionId: string,
    targetSessionId: string,
    requestId: string,
  ): Promise<boolean> {
    if (!(await this.#sessions.belongsToUser(targetSessionId, userId))) {
      throw new NotFoundError();
    }
    return mongoose.connection.transaction(async (mongoSession) => {
      const changed = await this.#sessions.revoke(
        targetSessionId,
        'USER_REVOKED_SESSION',
        new Date(),
        mongoSession,
      );
      if (changed) {
        await this.#audit.append(
          {
            action: 'AUTH_SESSION_REVOKED',
            actorSessionId: currentSessionId,
            actorType: 'USER',
            actorUserId: new mongoose.Types.ObjectId(userId),
            outcome: 'SUCCESS',
            requestId,
            targetId: targetSessionId,
            targetType: 'AuthSession',
          },
          mongoSession,
        );
      }
      return targetSessionId === currentSessionId;
    });
  }

  public async logoutOthers(
    userId: string,
    currentSessionId: string,
    requestId: string,
  ): Promise<number> {
    return mongoose.connection.transaction(async (mongoSession) => {
      const count = await this.#sessions.revokeOthers(
        userId,
        currentSessionId,
        'USER_LOGOUT_OTHERS',
        new Date(),
        mongoSession,
      );
      await this.#audit.append(
        {
          action: 'AUTH_OTHER_SESSIONS_REVOKED',
          actorSessionId: currentSessionId,
          actorType: 'USER',
          actorUserId: new mongoose.Types.ObjectId(userId),
          changes: { revokedCount: count },
          outcome: 'SUCCESS',
          requestId,
          targetId: userId,
          targetType: 'User',
        },
        mongoSession,
      );
      return count;
    });
  }

  public async changePassword(input: {
    csrfToken: string | undefined;
    currentPassword: string;
    currentSessionId: string;
    newPassword: string;
    refreshToken: string | undefined;
    requestId: string;
    userId: string;
  }): Promise<IssuedAuthentication> {
    const user = await this.#users.findByIdForAuthentication(input.userId);
    if (
      user === null ||
      !(await this.#passwords.verify(user.passwordHash, input.currentPassword))
    ) {
      throw new AuthenticationError('The current password is incorrect.', 'INVALID_CREDENTIALS');
    }
    const credential = this.#crypto.parseRefreshCredential(input.refreshToken);
    if (credential?.sessionId !== input.currentSessionId) {
      throw new AuthenticationError();
    }
    const currentSession = await this.#sessions.findActive(input.currentSessionId);
    if (currentSession === null) {
      throw new AuthenticationError('The session is unavailable.', 'SESSION_REVOKED');
    }
    this.#assertCsrf(currentSession.sessionId, currentSession.csrfNonce, input.csrfToken);
    const currentTokenHash = this.#crypto.hash(credential.token, 'refresh');
    if (!this.#crypto.equals(currentTokenHash, currentSession.currentTokenHash)) {
      throw new AuthenticationError('The session must be refreshed before changing the password.');
    }

    const passwordHash = await this.#passwords.hash(input.newPassword);
    const now = new Date();
    const replacement = this.#crypto.createRefreshCredential(currentSession.sessionId);
    await mongoose.connection.transaction(async (mongoSession) => {
      await this.#users.changePassword(input.userId, passwordHash, now, mongoSession);
      const revokedCount = await this.#sessions.revokeOthers(
        input.userId,
        input.currentSessionId,
        'PASSWORD_CHANGED',
        now,
        mongoSession,
      );
      const rotated = await this.#sessions.rotateCurrent(
        {
          currentTokenHash,
          graceUntil: new Date(now.getTime() + this.#options.refreshGraceSeconds * 1_000),
          newTokenHash: this.#crypto.hash(replacement.token, 'refresh'),
          now,
          sessionId: currentSession.sessionId,
        },
        mongoSession,
      );
      if (rotated === null) {
        throw new AuthenticationError('The session changed while updating the password.');
      }
      await this.#audit.append(
        {
          action: 'PASSWORD_CHANGED',
          actorSessionId: input.currentSessionId,
          actorType: 'USER',
          actorUserId: new mongoose.Types.ObjectId(input.userId),
          changes: { otherSessionsRevoked: revokedCount },
          outcome: 'SUCCESS',
          requestId: input.requestId,
          targetId: input.userId,
          targetType: 'User',
        },
        mongoSession,
      );
    });

    return this.#issueAuthentication(
      input.userId,
      currentSession.sessionId,
      replacement.token,
      currentSession.csrfNonce,
    );
  }

  async #issueAuthentication(
    userId: string,
    sessionId: string,
    refreshToken: string,
    csrfNonce: string,
  ): Promise<IssuedAuthentication> {
    const [accessToken, principal] = await Promise.all([
      this.#accessTokens.issue(userId, sessionId),
      this.#principals.resolve(userId, sessionId),
    ]);
    return {
      accessToken,
      csrfToken: this.#crypto.deriveCsrfToken(sessionId, csrfNonce),
      expiresInSeconds: this.#accessTokens.expiresInSeconds,
      principal,
      refreshToken,
    };
  }

  #assertCsrf(sessionId: string, nonce: string, supplied: string | undefined): void {
    const expected = this.#crypto.deriveCsrfToken(sessionId, nonce);
    if (supplied === undefined || !this.#crypto.equals(expected, supplied)) {
      throw new AppError('The request could not be verified.', {
        code: 'CSRF_VALIDATION_FAILED',
        statusCode: 403,
      });
    }
  }
}
