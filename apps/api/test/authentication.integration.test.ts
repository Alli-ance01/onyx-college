import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import mongoose from 'mongoose';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp } from '../src/app.js';
import { loadEnvironment } from '../src/config/environment.js';
import { SyncAccessControlService } from '../src/modules/access-control/application/sync-access-control.js';
import { BootstrapSuperAdminService } from '../src/modules/identity/application/bootstrap-super-admin.js';
import { CredentialCrypto } from '../src/modules/identity/infrastructure/credential-crypto.js';
import { AuthSessionModel } from '../src/modules/identity/infrastructure/auth-session-model.js';
import { PasswordService } from '../src/modules/identity/infrastructure/password-service.js';
import { UserModel } from '../src/modules/identity/infrastructure/user-model.js';

const origin = 'http://localhost:5173';
const logger = pino({ enabled: false });
let container: StartedMongoDBContainer | undefined;
let app: ReturnType<typeof createApp>;
let temporaryPassword: string;
let establishedAccessToken: string;

const authenticationEnvelopeSchema = z.object({
  data: z.object({
    accessToken: z.string(),
    csrfToken: z.string(),
    principal: z.object({ mustChangePassword: z.boolean() }),
  }),
});
const errorEnvelopeSchema = z.object({ error: z.object({ code: z.string() }) });

function cookieFrom(response: request.Response): string {
  const raw: unknown = response.headers['set-cookie'];
  const parsed = z.union([z.string(), z.array(z.string())]).parse(raw);
  const first = typeof parsed === 'string' ? parsed : parsed[0];
  if (first === undefined) throw new Error('Expected a refresh cookie.');
  return first.split(';', 1)[0] ?? '';
}

function runningContainer(): StartedMongoDBContainer {
  if (container === undefined) throw new Error('The MongoDB test container did not start.');
  return container;
}

function replicaSetConnectionString(startedContainer: StartedMongoDBContainer): string {
  const connectionString = new URL(startedContainer.getConnectionString());
  connectionString.searchParams.set('directConnection', 'true');
  connectionString.searchParams.set('replicaSet', 'rs0');
  return connectionString.toString();
}

beforeAll(async () => {
  container = await new MongoDBContainer('mongo:8.0').start();
  const connectionString = replicaSetConnectionString(container);
  await mongoose.connect(connectionString, { dbName: 'onyx_auth_integration' });
  const environment = loadEnvironment({
    AUTH_LOGIN_RATE_LIMIT_MAX: '100',
    AUTH_REFRESH_REPLAY_GRACE_SECONDS: '1',
    MONGODB_URI: connectionString,
    NODE_ENV: 'test',
    WEB_ORIGIN: origin,
  });
  app = createApp({ environment, logger, readiness: { isReady: () => true } });
  await Promise.all([AuthSessionModel.createIndexes(), UserModel.createIndexes()]);
  const accessSync = new SyncAccessControlService(logger);
  const result = await new BootstrapSuperAdminService(
    accessSync,
    new CredentialCrypto(environment.AUTH_REFRESH_TOKEN_PEPPER),
    new PasswordService(),
  ).execute({ email: 'root@onyx.test', username: 'root.admin' });
  temporaryPassword = result.temporaryPassword;
});

afterAll(async () => {
  await mongoose.disconnect();
  await container?.stop();
});

describe('authentication and access integration', () => {
  it('refuses duplicate initial SUPER_ADMIN bootstrap', async () => {
    const environment = loadEnvironment({
      MONGODB_URI: replicaSetConnectionString(runningContainer()),
      NODE_ENV: 'test',
      WEB_ORIGIN: origin,
    });
    await expect(
      new BootstrapSuperAdminService(
        new SyncAccessControlService(logger),
        new CredentialCrypto(environment.AUTH_REFRESH_TOKEN_PEPPER),
      ).execute({ username: 'another.root' }),
    ).rejects.toMatchObject({ code: 'BOOTSTRAP_ALREADY_COMPLETED', statusCode: 409 });
  });

  it('enforces forced password replacement and revokes other sessions on change', async () => {
    const browser = request.agent(app);
    const login = await browser
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ identifier: 'root.admin', password: temporaryPassword })
      .expect(200);
    const loggedIn = authenticationEnvelopeSchema.parse(login.body as unknown).data;
    expect(loggedIn.principal.mustChangePassword).toBe(true);

    await browser
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${loggedIn.accessToken}`)
      .expect(403)
      .expect((response) => {
        expect(errorEnvelopeSchema.parse(response.body as unknown).error.code).toBe(
          'PASSWORD_CHANGE_REQUIRED',
        );
      });

    const changed = await browser
      .post('/api/v1/auth/change-password')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${loggedIn.accessToken}`)
      .set('X-CSRF-Token', loggedIn.csrfToken)
      .send({ currentPassword: temporaryPassword, newPassword: 'a-new-secure-password-2026' })
      .expect(200);
    const passwordChanged = authenticationEnvelopeSchema.parse(changed.body as unknown).data;
    establishedAccessToken = passwordChanged.accessToken;
    expect(passwordChanged.principal.mustChangePassword).toBe(false);

    await browser
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${passwordChanged.accessToken}`)
      .expect(200);
  });

  it('allows one concurrent refresh, returns a retry signal for the other, then detects replay', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('User-Agent', 'Onyx integration browser')
      .send({ identifier: 'root.admin', password: 'a-new-secure-password-2026' })
      .expect(200);
    const loggedIn = authenticationEnvelopeSchema.parse(login.body as unknown).data;
    const originalCookie = cookieFrom(login);
    const csrf = loggedIn.csrfToken;
    const cookieParts = originalCookie.split('=', 2);
    const credentialParts = (cookieParts[1] ?? '').split('.', 2);
    const tamperedCookie = `${cookieParts[0] ?? 'onyx_refresh'}=${credentialParts[0] ?? ''}.${'x'.repeat(43)}`;

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', tamperedCookie)
      .set('X-CSRF-Token', csrf)
      .expect(204);
    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loggedIn.accessToken}`)
      .expect(200);

    const refresh = () =>
      request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', origin)
        .set('Cookie', originalCookie)
        .set('User-Agent', 'Onyx integration browser')
        .set('X-CSRF-Token', csrf);

    const responses = await Promise.all([refresh(), refresh()]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const winner = responses.find(({ status }) => status === 200);
    expect(winner).toBeDefined();
    const retryResponse = responses.find(({ status }) => status === 409);
    expect(errorEnvelopeSchema.parse(retryResponse?.body as unknown).error.code).toBe(
      'AUTH_REFRESH_RETRY',
    );

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await refresh()
      .expect(401)
      .expect((response) => {
        expect(errorEnvelopeSchema.parse(response.body as unknown).error.code).toBe(
          'SESSION_REVOKED',
        );
      });

    if (winner === undefined) throw new Error('Expected one successful concurrent refresh.');
    const refreshed = authenticationEnvelopeSchema.parse(winner.body as unknown).data;

    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshed.accessToken}`)
      .expect(401);
  });

  it('locks repeated failed credentials and enforces authoritative account status', async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({ identifier: 'root.admin', password: `incorrect-${String(attempt)}` })
        .expect(401);
      expect(errorEnvelopeSchema.parse(response.body as unknown).error.code).toBe(
        'INVALID_CREDENTIALS',
      );
    }

    const locked = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ identifier: 'root.admin', password: 'a-new-secure-password-2026' })
      .expect(401);
    expect(errorEnvelopeSchema.parse(locked.body as unknown).error.code).toBe('ACCOUNT_LOCKED');

    await UserModel.updateOne(
      { normalizedUsername: 'root.admin' },
      {
        $set: { accountStatus: 'SUSPENDED', failedLoginCount: 0 },
        $unset: { firstFailedLoginAt: 1, lockedUntil: 1 },
      },
    );
    const unavailable = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${establishedAccessToken}`)
      .expect(401);
    expect(errorEnvelopeSchema.parse(unavailable.body as unknown).error.code).toBe(
      'ACCOUNT_UNAVAILABLE',
    );
  });
});
