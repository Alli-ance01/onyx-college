import { describe, expect, it } from 'vitest';

import { AccessTokenService } from '../src/modules/identity/infrastructure/access-token-service.js';

describe('AccessTokenService', () => {
  const options = {
    audience: 'onyx-tests',
    issuer: 'onyx-test-api',
    secret: 'test-access-token-secret-at-least-32-characters',
    ttlSeconds: 600,
  };

  it('issues signed minimal tokens and validates issuer and audience', async () => {
    const service = new AccessTokenService(options);
    const token = await service.issue('user-id', 'session-id');

    await expect(service.verify(token)).resolves.toEqual({
      sessionId: 'session-id',
      userId: 'user-id',
    });
    await expect(
      new AccessTokenService({ ...options, audience: 'another-audience' }).verify(token),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED', statusCode: 401 });
  });
});
