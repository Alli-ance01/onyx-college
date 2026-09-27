import pino, { type Logger } from 'pino';

import type { AppEnvironment } from '../../config/environment.js';

const redactedPaths = [
  'password',
  '*.password',
  'currentPassword',
  '*.currentPassword',
  'newPassword',
  '*.newPassword',
  'passwordHash',
  '*.passwordHash',
  'refreshToken',
  '*.refreshToken',
  'csrfToken',
  '*.csrfToken',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'res.headers.set-cookie',
  'token',
  '*.token',
  '*.secret',
];

export function createLogger(environment: AppEnvironment): Logger {
  return pino({
    base: {
      environment: environment.NODE_ENV,
      service: 'onyx-api',
    },
    level: environment.LOG_LEVEL,
    redact: {
      censor: '[REDACTED]',
      paths: redactedPaths,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
