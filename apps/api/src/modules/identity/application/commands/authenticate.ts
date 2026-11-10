import type { Profile } from '@radian/contracts';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import { DomainError, RateLimitedError, UnauthorizedError } from '../../../../shared/domain/errors.js';
import { Email } from '../../domain/email.js';
import type { PasswordHasher } from '../../domain/password-hasher.js';
import type { IdentityRepos, LoginAttemptLimiter } from '../ports.js';
import { toProfile } from '../profile.js';

const INVALID = () => new UnauthorizedError('Email o contraseña incorrectos', 'INVALID_CREDENTIALS');
// Hash de referencia para igualar el tiempo de respuesta cuando el email no existe.
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$1Y0D1zj0Wn1Hk2C0n5tXqI5v1Xh4dJ7m0m8b5yYzQ0c';

/**
 * Verifica credenciales. Lee la base de escritura porque valida una invariante
 * (Constitución III, excepción permitida). Mensaje genérico para no revelar cuentas.
 */
export class Authenticate {
  constructor(private readonly deps: { uow: UnitOfWork<IdentityRepos>; hasher: PasswordHasher; limiter: LoginAttemptLimiter }) {}

  async execute(input: { email: string; password: string; ip: string }): Promise<Profile> {
    let email: Email;
    try {
      email = Email.create(input.email);
    } catch (err) {
      if (err instanceof DomainError) throw INVALID();
      throw err;
    }
    const key = `${email.value}|${input.ip}`;
    const { blocked, retryAfterSeconds } = await this.deps.limiter.check(key);
    if (blocked) {
      throw new RateLimitedError('TOO_MANY_ATTEMPTS', 'Demasiados intentos fallidos. Probá de nuevo más tarde.', { retryAfterSeconds });
    }

    const customer = await this.deps.uow.run(({ customers }) => customers.findByEmail(email));
    const ok = customer
      ? await this.deps.hasher.verify(customer.passwordHash, input.password)
      : (await this.deps.hasher.verify(DUMMY_HASH, input.password).catch(() => false), false);

    if (!customer || !ok || !customer.isActive) {
      await this.deps.limiter.recordFailure(key);
      throw INVALID();
    }
    await this.deps.limiter.reset(key);
    return toProfile(customer);
  }
}
