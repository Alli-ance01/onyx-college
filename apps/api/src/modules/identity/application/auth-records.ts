import type { AccountStatus, AccountType, AuthenticatedPrincipal } from '@onyx/contracts';
import type { ClientSession } from 'mongoose';

export interface AuthUserRecord {
  accountStatus: AccountStatus;
  accountType: AccountType;
  failedLoginCount: number;
  firstFailedLoginAt?: Date;
  id: string;
  lockedUntil?: Date;
  mustChangePassword: boolean;
  passwordHash: string;
  username: string;
}

export interface FailedLoginPolicy {
  lockDurationSeconds: number;
  maxAttempts: number;
  windowSeconds: number;
}

export interface SessionRecord {
  createdAt: Date;
  csrfNonce: string;
  currentTokenHash: string;
  deviceLabel: string;
  expiresAt: Date;
  familyId: string;
  fingerprintHash: string;
  id: string;
  lastUsedAt: Date;
  previousTokenHash?: string;
  previousTokenValidUntil?: Date;
  rotationCounter: number;
  sessionId: string;
  status: 'ACTIVE' | 'REVOKED';
  userId: string;
}

export interface UserRepository {
  changePassword(
    userId: string,
    passwordHash: string,
    now: Date,
    session?: ClientSession,
  ): Promise<void>;
  findByIdForAuthentication(userId: string): Promise<AuthUserRecord | null>;
  findForLogin(identifier: string): Promise<AuthUserRecord | null>;
  markLoginSuccessful(userId: string, now: Date): Promise<void>;
  recordFailedLogin(
    userId: string,
    now: Date,
    policy: FailedLoginPolicy,
  ): Promise<{ locked: boolean }>;
  replacePasswordHash(userId: string, passwordHash: string): Promise<void>;
}

export interface PrincipalResolver {
  resolve(userId: string, sessionId: string): Promise<AuthenticatedPrincipal>;
}
