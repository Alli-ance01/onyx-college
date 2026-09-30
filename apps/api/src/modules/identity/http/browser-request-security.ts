import type { RequestHandler } from 'express';

import { AppError } from '../../../app/errors/app-error.js';

function parseRefererOrigin(referer: string | undefined): string | undefined {
  if (referer === undefined) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

export function requireTrustedBrowserOrigin(webOrigin: string): RequestHandler {
  return (request, _response, next) => {
    try {
      const origin = request.header('origin');
      const referer = request.header('referer');
      const refererOrigin = parseRefererOrigin(referer);
      const fetchSite = request.header('sec-fetch-site');
      const hasTrustedOrigin = origin === webOrigin;
      const hasTrustedReferer = origin === undefined && refererOrigin === webOrigin;
      const isPermittedFetchSite =
        fetchSite === undefined ||
        fetchSite === 'same-origin' ||
        fetchSite === 'same-site' ||
        (fetchSite === 'cross-site' && hasTrustedOrigin);

      if ((!hasTrustedOrigin && !hasTrustedReferer) || !isPermittedFetchSite) {
        throw new AppError('The request origin is not allowed.', {
          code: 'CSRF_VALIDATION_FAILED',
          statusCode: 403,
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
