import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export interface RefreshCredential {
  sessionId: string;
  token: string;
}

export class CredentialCrypto {
  readonly #pepper: string;

  public constructor(pepper: string) {
    this.#pepper = pepper;
  }

  public createRefreshCredential(sessionId: string = randomUUID()): RefreshCredential {
    return { sessionId, token: `${sessionId}.${randomBytes(32).toString('base64url')}` };
  }

  public createOpaqueValue(bytes = 24): string {
    return randomBytes(bytes).toString('base64url');
  }

  public hash(value: string, purpose: string): string {
    return createHmac('sha256', this.#pepper).update(`${purpose}:${value}`).digest('base64url');
  }

  public deriveCsrfToken(sessionId: string, nonce: string): string {
    return this.hash(`${sessionId}:${nonce}`, 'csrf');
  }

  public equals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  public parseRefreshCredential(value: string | undefined): RefreshCredential | null {
    if (value === undefined) {
      return null;
    }
    const separator = value.indexOf('.');
    if (separator < 1 || separator === value.length - 1) {
      return null;
    }
    const sessionId = value.slice(0, separator);
    const secret = value.slice(separator + 1);
    if (!/^[0-9a-f-]{36}$/iu.test(sessionId) || !/^[A-Za-z0-9_-]{40,}$/u.test(secret)) {
      return null;
    }
    return { sessionId, token: value };
  }
}
