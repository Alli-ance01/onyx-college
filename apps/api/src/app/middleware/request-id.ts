import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

const acceptedRequestId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export function requestId(request: Request, response: Response, next: NextFunction): void {
  const incoming = request.header('x-request-id');
  const value =
    incoming !== undefined && acceptedRequestId.test(incoming) ? incoming : `req_${randomUUID()}`;

  request.requestId = value;
  response.setHeader('X-Request-Id', value);
  next();
}
