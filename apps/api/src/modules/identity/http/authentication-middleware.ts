import type { NextFunction, Request, RequestHandler, Response } from 'express';

import {
  AuthenticationError,
  AuthorizationError,
  PasswordChangeRequiredError,
} from '../../../app/errors/app-error.js';
import type { PrincipalResolver } from '../application/auth-records.js';
import type { AccessTokenService } from '../infrastructure/access-token-service.js';
import type { MongoSessionRepository } from '../infrastructure/mongo-session-repository.js';

export function createAuthenticationMiddleware(dependencies: {
  accessTokens: AccessTokenService;
  principals: PrincipalResolver;
  sessions: MongoSessionRepository;
}): RequestHandler {
  return async (request, _response, next) => {
    try {
      const authorization = request.header('authorization');
      if (!authorization?.startsWith('Bearer ')) {
        throw new AuthenticationError();
      }
      const token = authorization.slice('Bearer '.length).trim();
      const claims = await dependencies.accessTokens.verify(token);
      const session = await dependencies.sessions.findActive(claims.sessionId);
      if (session?.userId !== claims.userId || session.expiresAt <= new Date()) {
        throw new AuthenticationError('The session is unavailable.', 'SESSION_REVOKED');
      }
      request.authPrincipal = await dependencies.principals.resolve(
        claims.userId,
        claims.sessionId,
      );
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAuthenticatedPrincipal(request: Request) {
  if (request.authPrincipal === undefined) {
    throw new AuthenticationError();
  }
  return request.authPrincipal;
}

export function requirePasswordChangeComplete(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  try {
    if (requireAuthenticatedPrincipal(request).mustChangePassword) {
      throw new PasswordChangeRequiredError();
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(...required: readonly string[]): RequestHandler {
  return (request, _response, next) => {
    try {
      const principal = requireAuthenticatedPrincipal(request);
      if (principal.mustChangePassword) {
        throw new PasswordChangeRequiredError();
      }
      const effective = new Set(principal.permissions);
      if (!required.every((permission) => effective.has(permission))) {
        throw new AuthorizationError();
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAnyPermission(...required: readonly string[]): RequestHandler {
  return (request, _response, next) => {
    try {
      const principal = requireAuthenticatedPrincipal(request);
      if (principal.mustChangePassword) {
        throw new PasswordChangeRequiredError();
      }
      if (!required.some((permission) => principal.permissions.includes(permission))) {
        throw new AuthorizationError();
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
