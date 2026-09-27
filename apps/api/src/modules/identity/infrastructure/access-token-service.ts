import { randomUUID } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

import { AuthenticationError } from '../../../app/errors/app-error.js';

export interface VerifiedAccessToken {
  sessionId: string;
  userId: string;
}

interface AccessTokenOptions {
  audience: string;
  issuer: string;
  secret: string;
  ttlSeconds: number;
}

export class AccessTokenService {
  readonly #audience: string;
  readonly #issuer: string;
  readonly #key: Uint8Array;
  readonly #ttlSeconds: number;

  public constructor(options: AccessTokenOptions) {
    this.#audience = options.audience;
    this.#issuer = options.issuer;
    this.#key = new TextEncoder().encode(options.secret);
    this.#ttlSeconds = options.ttlSeconds;
  }

  public get expiresInSeconds(): number {
    return this.#ttlSeconds;
  }

  public async issue(userId: string, sessionId: string): Promise<string> {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(this.#issuer)
      .setAudience(this.#audience)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1_000) + this.#ttlSeconds)
      .sign(this.#key);
  }

  public async verify(token: string): Promise<VerifiedAccessToken> {
    try {
      const result = await jwtVerify(token, this.#key, {
        algorithms: ['HS256'],
        audience: this.#audience,
        issuer: this.#issuer,
      });
      if (typeof result.payload.sub !== 'string' || typeof result.payload.sid !== 'string') {
        throw new AuthenticationError();
      }
      return { sessionId: result.payload.sid, userId: result.payload.sub };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError('The access token is invalid or expired.');
    }
  }
}
