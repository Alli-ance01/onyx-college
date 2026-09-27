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
      if (
        (origin !== webOrigin && refererOrigin !== webOrigin) ||
        (fetchSite !== undefined && !['same-origin', 'same-site'].includes(fetchSite))
      ) {
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
