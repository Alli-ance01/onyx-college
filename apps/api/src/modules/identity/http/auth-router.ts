import type { ErrorEnvelope, SuccessEnvelope } from '@onyx/contracts';
import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { ValidationError } from '../../../app/errors/app-error.js';
import type { AppEnvironment } from '../../../config/environment.js';
import type {
  AuthenticationService,
  IssuedAuthentication,
  RequestSecurityContext,
} from '../application/authentication-service.js';
import type { CredentialCrypto } from '../infrastructure/credential-crypto.js';
import {
  createAuthenticationMiddleware,
  requireAuthenticatedPrincipal,
  requirePasswordChangeComplete,
} from './authentication-middleware.js';
import { requireTrustedBrowserOrigin } from './browser-request-security.js';
import { validateBody } from './validation.js';
import type { AccessTokenService } from '../infrastructure/access-token-service.js';
import type { PrincipalResolver } from '../application/auth-records.js';
import type { MongoSessionRepository } from '../infrastructure/mongo-session-repository.js';

const loginSchema = z
  .object({
    identifier: z.string().trim().min(3).max(254),
    password: z.string().min(1).max(128),
  })
  .strict();

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(12).max(128),
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'The new password must differ from the current password.',
    path: ['newPassword'],
  });

function cookies(request: Request): Readonly<Record<string, string | undefined>> {
  return request.cookies as Readonly<Record<string, string | undefined>>;
}

function createRateLimiter(windowSeconds: number, limit: number) {
  return rateLimit({
    handler: (request, response) => {
      const envelope: ErrorEnvelope = {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
          requestId: request.requestId,
        },
      };
      response.status(429).json(envelope);
    },
    legacyHeaders: false,
    limit,
    standardHeaders: 'draft-8',
    windowMs: windowSeconds * 1_000,
  });
}

function safeDeviceLabel(userAgent: string | undefined): string {
  if (userAgent === undefined || userAgent.trim().length === 0) {
    return 'Unknown browser';
  }
  let sanitized = '';
  for (const character of userAgent) {
    const code = character.codePointAt(0) ?? 0;
    if (code > 31 && code !== 127) sanitized += character;
  }
  return sanitized.slice(0, 160);
}

function securityContext(request: Request, crypto: CredentialCrypto): RequestSecurityContext {
  const userAgent = request.header('user-agent');
  return {
    deviceLabel: safeDeviceLabel(userAgent),
    fingerprintHash: crypto.hash(userAgent ?? 'unknown', 'fingerprint'),
    ipHash: crypto.hash(request.ip ?? 'unknown', 'ip'),
    requestId: request.requestId,
  };
}

function publicAuthentication(result: IssuedAuthentication) {
  return {
    accessToken: result.accessToken,
    csrfToken: result.csrfToken,
    expiresInSeconds: result.expiresInSeconds,
    principal: result.principal,
  };
}

export function createAuthRouter(dependencies: {
  accessTokens: AccessTokenService;
  authentication: AuthenticationService;
  crypto: CredentialCrypto;
  environment: AppEnvironment;
  principals: PrincipalResolver;
  sessions: MongoSessionRepository;
}): Router {
  const router = Router();
  const { environment } = dependencies;
  const trustedOrigin = requireTrustedBrowserOrigin(environment.WEB_ORIGIN);
  // Session inspection and password replacement must remain available during setup.
  const authenticate = createAuthenticationMiddleware(dependencies, {
    allowPasswordChangeRequired: true,
  });
  const loginLimiter = createRateLimiter(
    environment.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    environment.AUTH_LOGIN_RATE_LIMIT_MAX,
  );
  const refreshLimiter = createRateLimiter(
    environment.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    environment.AUTH_REFRESH_RATE_LIMIT_MAX,
  );
  const cookieOptions = {
    httpOnly: true,
    maxAge: environment.AUTH_REFRESH_TOKEN_TTL_SECONDS * 1_000,
    path: '/api/v1/auth',
    sameSite: environment.AUTH_COOKIE_SAME_SITE,
    secure: environment.AUTH_COOKIE_SECURE,
  } as const;

  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.post(
    '/login',
    trustedOrigin,
    loginLimiter,
    validateBody(loginSchema),
    async (request, response) => {
      const body = loginSchema.parse(request.body);
      const result = await dependencies.authentication.login(
        body.identifier,
        body.password,
        securityContext(request, dependencies.crypto),
      );
      response.cookie(environment.AUTH_COOKIE_NAME, result.refreshToken, cookieOptions);
      const envelope: SuccessEnvelope<ReturnType<typeof publicAuthentication>> = {
        data: publicAuthentication(result),
      };
      response.status(200).json(envelope);
    },
  );

  router.get('/csrf', trustedOrigin, refreshLimiter, async (request, response) => {
    const result = await dependencies.authentication.issueCsrf(
      cookies(request)[environment.AUTH_COOKIE_NAME],
    );
    const envelope: SuccessEnvelope<typeof result> = { data: result };
    response.json(envelope);
  });

  router.post('/refresh', trustedOrigin, refreshLimiter, async (request, response) => {
    const result = await dependencies.authentication.refresh(
      cookies(request)[environment.AUTH_COOKIE_NAME],
      request.header('x-csrf-token'),
      securityContext(request, dependencies.crypto),
    );
    response.cookie(environment.AUTH_COOKIE_NAME, result.refreshToken, cookieOptions);
    const envelope: SuccessEnvelope<ReturnType<typeof publicAuthentication>> = {
      data: publicAuthentication(result),
    };
    response.json(envelope);
  });

  router.post('/logout', trustedOrigin, refreshLimiter, async (request, response) => {
    await dependencies.authentication.logout(
      cookies(request)[environment.AUTH_COOKIE_NAME],
      request.header('x-csrf-token'),
      request.requestId,
    );
    response.clearCookie(environment.AUTH_COOKIE_NAME, cookieOptions);
    response.status(204).end();
  });

  router.get('/me', authenticate, (request, response) => {
    const envelope: SuccessEnvelope<ReturnType<typeof requireAuthenticatedPrincipal>> = {
      data: requireAuthenticatedPrincipal(request),
    };
    response.json(envelope);
  });

  router.get(
    '/sessions',
    authenticate,
    requirePasswordChangeComplete,
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const sessions = await dependencies.authentication.listSessions(
        principal.userId,
        principal.sessionId,
      );
      const envelope: SuccessEnvelope<typeof sessions> = { data: sessions };
      response.json(envelope);
    },
  );

  router.delete(
    '/sessions/:sessionId',
    authenticate,
    requirePasswordChangeComplete,
    async (request, response) => {
      const parsed = z.uuid().safeParse(request.params.sessionId);
      if (!parsed.success) {
        throw new ValidationError('The session identifier is invalid.');
      }
      const principal = requireAuthenticatedPrincipal(request);
      const revokedCurrent = await dependencies.authentication.revokeSession(
        principal.userId,
        principal.sessionId,
        parsed.data,
        request.requestId,
      );
      if (revokedCurrent) {
        response.clearCookie(environment.AUTH_COOKIE_NAME, cookieOptions);
      }
      response.status(204).end();
    },
  );

  router.post(
    '/logout-others',
    authenticate,
    requirePasswordChangeComplete,
    async (request, response) => {
      const principal = requireAuthenticatedPrincipal(request);
      const revokedCount = await dependencies.authentication.logoutOthers(
        principal.userId,
        principal.sessionId,
        request.requestId,
      );
      const envelope: SuccessEnvelope<{ revokedCount: number }> = { data: { revokedCount } };
      response.json(envelope);
    },
  );

  router.post(
    '/change-password',
    trustedOrigin,
    authenticate,
    validateBody(changePasswordSchema),
    async (request, response) => {
      const body = changePasswordSchema.parse(request.body);
      const principal = requireAuthenticatedPrincipal(request);
      const result = await dependencies.authentication.changePassword({
        csrfToken: request.header('x-csrf-token'),
        currentPassword: body.currentPassword,
        currentSessionId: principal.sessionId,
        newPassword: body.newPassword,
        refreshToken: cookies(request)[environment.AUTH_COOKIE_NAME],
        requestId: request.requestId,
        userId: principal.userId,
      });
      response.cookie(environment.AUTH_COOKIE_NAME, result.refreshToken, cookieOptions);
      const envelope: SuccessEnvelope<ReturnType<typeof publicAuthentication>> = {
        data: publicAuthentication(result),
      };
      response.json(envelope);
    },
  );

  return router;
}
