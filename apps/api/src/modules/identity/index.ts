import type { Router } from 'express';

import type { AppEnvironment } from '../../config/environment.js';
import { MongoPrincipalResolver } from '../access-control/infrastructure/mongo-principal-resolver.js';
import { AuditWriter } from '../audit/application/audit-writer.js';
import { AuthenticationService } from './application/authentication-service.js';
import { createAuthRouter } from './http/auth-router.js';
import { AccessTokenService } from './infrastructure/access-token-service.js';
import { CredentialCrypto } from './infrastructure/credential-crypto.js';
import { MongoSessionRepository } from './infrastructure/mongo-session-repository.js';
import { MongoUserRepository } from './infrastructure/mongo-user-repository.js';
import { PasswordService } from './infrastructure/password-service.js';

export function createIdentityModule(environment: AppEnvironment): { router: Router } {
  const crypto = new CredentialCrypto(environment.AUTH_REFRESH_TOKEN_PEPPER);
  const accessTokens = new AccessTokenService({
    audience: environment.AUTH_AUDIENCE,
    issuer: environment.AUTH_ISSUER,
    secret: environment.AUTH_ACCESS_TOKEN_SECRET,
    ttlSeconds: environment.AUTH_ACCESS_TOKEN_TTL_SECONDS,
  });
  const principals = new MongoPrincipalResolver();
  const sessions = new MongoSessionRepository();
  const authentication = new AuthenticationService({
    accessTokens,
    audit: new AuditWriter(),
    crypto,
    options: {
      failedLoginPolicy: {
        lockDurationSeconds: environment.AUTH_LOCK_DURATION_SECONDS,
        maxAttempts: environment.AUTH_MAX_FAILED_ATTEMPTS,
        windowSeconds: environment.AUTH_FAILED_ATTEMPT_WINDOW_SECONDS,
      },
      refreshGraceSeconds: environment.AUTH_REFRESH_REPLAY_GRACE_SECONDS,
      refreshTtlSeconds: environment.AUTH_REFRESH_TOKEN_TTL_SECONDS,
    },
    passwords: new PasswordService(),
    principals,
    sessions,
    users: new MongoUserRepository(),
  });
  return {
    router: createAuthRouter({
      accessTokens,
      authentication,
      crypto,
      environment,
      principals,
      sessions,
    }),
  };
}
