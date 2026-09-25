import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp } from '../src/app.js';
import type { AppEnvironment } from '../src/config/environment.js';
import type { ReadinessProbe } from '../src/platform/health/service-readiness.js';

const environment: AppEnvironment = {
  JSON_BODY_LIMIT: '1mb',
  LOG_LEVEL: 'info',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/onyx_test',
  NODE_ENV: 'test',
  PORT: 4_000,
  TRUST_PROXY_HOPS: 0,
  WEB_ORIGIN: 'http://localhost:5173',
};

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
});
