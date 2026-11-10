import { hash, verify } from '@node-rs/argon2';
import type { PasswordHasher } from '../../domain/password-hasher.js';

/** `Algorithm.Argon2id` (const enum no accesible con verbatimModuleSyntax). */
const ARGON2ID = 2;

/** argon2id con parámetros OWASP por defecto (m=19 MiB, t=2, p=1). */
export class Argon2PasswordHasher implements PasswordHasher {
  constructor(private readonly params: { memoryCost?: number; timeCost?: number } = {}) {}

  hash(plain: string): Promise<string> {
    return hash(plain, {
      algorithm: ARGON2ID,
      memoryCost: this.params.memoryCost ?? 19_456,
      timeCost: this.params.timeCost ?? 2,
      parallelism: 1,
    });
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain);
    } catch {
      return false;
    }
  }
}
