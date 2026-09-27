import argon2 from 'argon2';

const passwordOptions = {
  hashLength: 32,
  memoryCost: 65_536,
  parallelism: 1,
  timeCost: 3,
  type: argon2.argon2id,
} as const;

export class PasswordService {
  #dummyHash: Promise<string> | undefined;

  public hash(password: string): Promise<string> {
    return argon2.hash(password, passwordOptions);
  }

  public verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  public needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, passwordOptions);
  }

  public async verifyForLogin(hash: string | null, password: string): Promise<boolean> {
    if (hash !== null) {
      return this.verify(hash, password);
    }

    this.#dummyHash ??= this.hash('not-a-user-password');
    await this.verify(await this.#dummyHash, password);
    return false;
  }
}
