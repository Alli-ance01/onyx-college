import pino, { type Logger } from 'pino';

import type { AppEnvironment } from '../../config/environment.js';

const redactedPaths = [
  'password',
  '*.password',
  'req.headers.authorization',
  'req.headers.cookie',
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
