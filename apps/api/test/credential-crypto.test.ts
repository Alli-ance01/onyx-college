import { describe, expect, it } from 'vitest';

import { CredentialCrypto } from '../src/modules/identity/infrastructure/credential-crypto.js';

describe('CredentialCrypto', () => {
  const crypto = new CredentialCrypto('test-refresh-pepper-with-at-least-32-characters');

  it('creates parseable opaque refresh credentials and stores only derived hashes', () => {
    const credential = crypto.createRefreshCredential();
    const parsed = crypto.parseRefreshCredential(credential.token);

    expect(parsed).toEqual(credential);
    expect(crypto.hash(credential.token, 'refresh')).not.toContain(credential.token);
    expect(crypto.parseRefreshCredential('malformed')).toBeNull();
  });

  it('derives stable, purpose-separated values', () => {
    const first = crypto.hash('value', 'refresh');
    const second = crypto.hash('value', 'fingerprint');

    expect(first).not.toBe(second);
    expect(crypto.equals(first, crypto.hash('value', 'refresh'))).toBe(true);
    expect(crypto.equals(first, second)).toBe(false);
  });
});
