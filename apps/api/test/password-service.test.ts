import { describe, expect, it } from 'vitest';

import { PasswordService } from '../src/modules/identity/infrastructure/password-service.js';

describe('PasswordService', () => {
  it('hashes passwords with Argon2id and verifies without exposing plaintext', async () => {
    const service = new PasswordService();
    const hash = await service.hash('a sufficiently strong password');

    expect(hash).toMatch(/^\$argon2id\$/u);
    expect(hash).not.toContain('sufficiently strong');
    expect(await service.verify(hash, 'a sufficiently strong password')).toBe(true);
    expect(await service.verify(hash, 'incorrect password')).toBe(false);
    expect(service.needsRehash(hash)).toBe(false);
  });

  it('performs a dummy verification for unknown accounts', async () => {
    const service = new PasswordService();
    await expect(service.verifyForLogin(null, 'unknown password')).resolves.toBe(false);
  });
});
