import type { AuthenticatedPrincipal } from '@onyx/contracts';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { loadEnvironment } from '../src/config/environment.js';
import {
  requirePermission,
  requirePasswordChangeComplete,
} from '../src/modules/identity/http/authentication-middleware.js';

const environment = loadEnvironment({
  MONGODB_URI: 'mongodb://127.0.0.1:27017/onyx_test',
  NODE_ENV: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
});
const principal: AuthenticatedPrincipal = {
  accountStatus: 'ACTIVE',
  accountType: 'TEACHER',
  displayName: 'Teacher One',
  mustChangePassword: false,
  permissions: ['students.read'],
  portal: 'TEACHER',
  roles: ['TEACHER'],
  sessionId: 'session-id',
  userId: 'user-id',
  username: 'teacher.one',
};

function buildApp(current: AuthenticatedPrincipal) {
  return createApp({
    environment,
    logger: pino({ enabled: false }),
    readiness: { isReady: () => true },
    registerFoundationRoutes: (app) => {
      app.get(
        '/api/v1/test-protected',
        (request_, _response, next) => {
          request_.authPrincipal = current;
          next();
        },
        requirePasswordChangeComplete,
        requirePermission('students.read'),
        (_request, response) => response.json({ data: { allowed: true } }),
      );
    },
  });
}

describe('authorization middleware foundation', () => {
  it('allows an effective permission after password setup', async () => {
    await request(buildApp(principal)).get('/api/v1/test-protected').expect(200);
  });

  it('rejects missing permission without relying on role names', async () => {
    const response = await request(buildApp({ ...principal, permissions: [] }))
      .get('/api/v1/test-protected')
      .expect(403);
    expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('blocks protected operations until the temporary password is replaced', async () => {
    const response = await request(buildApp({ ...principal, mustChangePassword: true }))
      .get('/api/v1/test-protected')
      .expect(403);
    expect(response.body).toMatchObject({ error: { code: 'PASSWORD_CHANGE_REQUIRED' } });
  });
});
