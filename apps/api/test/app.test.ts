import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp } from '../src/app.js';
import { loadEnvironment } from '../src/config/environment.js';
import type { ReadinessProbe } from '../src/platform/health/service-readiness.js';

const environment = loadEnvironment({
  MONGODB_URI: 'mongodb://127.0.0.1:27017/onyx_test',
  NODE_ENV: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
});

const logger = pino({ enabled: false });
const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

function createReadiness(isReady: boolean): ReadinessProbe {
  return { isReady: () => isReady };
}

describe('API foundation', () => {
  it('reports liveness without requiring dependency readiness', async () => {
    const app = createApp({ environment, logger, readiness: createReadiness(false) });

    const response = await request(app).get('/api/v1/health/live').expect(200);

    expect(response.body).toEqual({ data: { status: 'ok' } });
    expect(response.headers['x-request-id']).toMatch(/^req_/u);
  });

  it('reports readiness only when required dependencies are ready', async () => {
    const unavailableApp = createApp({
      environment,
      logger,
      readiness: createReadiness(false),
    });
    const unavailable = await request(unavailableApp).get('/api/v1/health/ready').expect(503);
    const unavailableBody = errorEnvelopeSchema.parse(unavailable.body as unknown);

    expect(unavailableBody.error).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: 'The service is not ready to accept requests.',
    });

    const readyApp = createApp({ environment, logger, readiness: createReadiness(true) });
    const ready = await request(readyApp).get('/api/v1/health/ready').expect(200);

    expect(ready.body).toEqual({ data: { status: 'ready' } });
  });

  it('returns the standard not-found envelope', async () => {
    const app = createApp({ environment, logger, readiness: createReadiness(true) });

    const response = await request(app).get('/api/v1/not-a-route').expect(404);
    const responseBody = errorEnvelopeSchema.parse(response.body as unknown);

    expect(responseBody.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
    });
    expect(responseBody.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('normalizes unexpected errors without exposing internal details', async () => {
    const app = createApp({
      environment,
      logger,
      readiness: createReadiness(true),
      registerFoundationRoutes: (expressApp) => {
        expressApp.get('/api/v1/foundation-error', () => {
          throw new Error('mongodb://user:secret@internal-host/database');
        });
      },
    });

    const response = await request(app).get('/api/v1/foundation-error').expect(500);
    const responseBody = errorEnvelopeSchema.parse(response.body as unknown);

    expect(responseBody.error).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
    });
    expect(JSON.stringify(response.body)).not.toContain('internal-host');
    expect(responseBody.error).not.toHaveProperty('stack');
  });

  it('rate limits repeated credential-sensitive requests before database work', async () => {
    const limitedEnvironment = loadEnvironment({
      AUTH_LOGIN_RATE_LIMIT_MAX: '1',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/onyx_test',
      NODE_ENV: 'test',
      WEB_ORIGIN: 'http://localhost:5173',
    });
    const app = createApp({
      environment: limitedEnvironment,
      logger,
      readiness: createReadiness(true),
    });

    await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', limitedEnvironment.WEB_ORIGIN)
      .send({})
      .expect(400);
    const limited = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', limitedEnvironment.WEB_ORIGIN)
      .send({})
      .expect(429);
    expect(limited.body).toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });

  it('rejects malformed or untrusted browser origins as CSRF failures', async () => {
    const app = createApp({ environment, logger, readiness: createReadiness(true) });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Referer', 'not-a-valid-url')
      .send({})
      .expect(403);
    expect(response.body).toMatchObject({ error: { code: 'CSRF_VALIDATION_FAILED' } });
  });

  it('accepts cross-site browser metadata only for the exact configured origin', async () => {
    const app = createApp({ environment, logger, readiness: createReadiness(true) });

    await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', environment.WEB_ORIGIN)
      .set('Sec-Fetch-Site', 'cross-site')
      .send({})
      .expect(400);

    const untrusted = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://attacker.example')
      .set('Referer', environment.WEB_ORIGIN + '/login')
      .set('Sec-Fetch-Site', 'cross-site')
      .send({})
      .expect(403);

    expect(untrusted.body).toMatchObject({ error: { code: 'CSRF_VALIDATION_FAILED' } });
  });

  it('requires secure cookies when SameSite=None is configured', () => {
    expect(() =>
      loadEnvironment({
        AUTH_COOKIE_SAME_SITE: 'none',
        AUTH_COOKIE_SECURE: 'false',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/onyx_test',
        NODE_ENV: 'test',
        WEB_ORIGIN: 'https://onyx-college.vercel.app',
      }),
    ).toThrow('AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAME_SITE is none');

    expect(
      loadEnvironment({
        AUTH_COOKIE_SAME_SITE: 'none',
        AUTH_COOKIE_SECURE: 'true',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/onyx_test',
        NODE_ENV: 'test',
        WEB_ORIGIN: 'https://onyx-college.vercel.app',
      }).AUTH_COOKIE_SAME_SITE,
    ).toBe('none');
  });
});
