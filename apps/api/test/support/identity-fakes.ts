import type { Profile } from '@radian/contracts';
import { Customer } from '../../src/modules/identity/domain/customer.js';
import type { CustomerRepository } from '../../src/modules/identity/domain/customer-repository.js';
import type { Email } from '../../src/modules/identity/domain/email.js';
import type { PasswordHasher } from '../../src/modules/identity/domain/password-hasher.js';
import type { CustomerProfileReader, IdentityRepos, LoginAttemptLimiter } from '../../src/modules/identity/application/ports.js';
import type { UnitOfWork } from '../../src/shared/application/unit-of-work.js';
import { ConflictError } from '../../src/shared/domain/errors.js';

export class InMemoryCustomerRepository implements CustomerRepository {
  rows = new Map<string, ReturnType<Customer['toSnapshot']> & { passwordHash: string }>();
  published: string[] = [];

  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? Customer.rehydrate(row) : null;
  }

  async findByEmail(email: Email) {
    const row = [...this.rows.values()].find((r) => r.email === email.value);
    return row ? Customer.rehydrate(row) : null;
  }

  async save(customer: Customer) {
    const existing = this.rows.get(customer.id);
    if (existing && existing.version !== customer.persistedVersion) throw new ConflictError('VERSION_CONFLICT', 'conflicto');
    const sameEmail = [...this.rows.values()].find((r) => r.email === customer.email.value && r.id !== customer.id);
    if (sameEmail) throw new ConflictError('EMAIL_TAKEN', 'El email ya está registrado');
    this.published.push(...customer.pullEvents().map((e) => e.type));
    this.rows.set(customer.id, { ...customer.toSnapshot(), passwordHash: customer.passwordHash });
  }
}

export function fakeUow(repos: IdentityRepos): UnitOfWork<IdentityRepos> {
  return { run: (work) => work(repos) };
}

/** Lector que simula la proyección leyendo del repositorio en memoria. */
export function inMemoryProfileReader(repo: InMemoryCustomerRepository): CustomerProfileReader {
  return {
    async findProfile(id): Promise<Profile | null> {
      const r = repo.rows.get(id);
      return r ? { id: r.id, email: r.email, name: r.name, role: r.role, defaultAddress: r.defaultAddress } : null;
    },
    async findAuth(id) {
      const r = repo.rows.get(id);
      return r ? { id: r.id, role: r.role, status: r.status } : null;
    },
  };
}

export const fakeHasher: PasswordHasher = {
  hash: async (plain) => `hashed:${plain}`,
  verify: async (hash, plain) => hash === `hashed:${plain}`,
};

export class FakeLimiter implements LoginAttemptLimiter {
  failures = new Map<string, number>();
  constructor(private readonly max = 5) {}
  async check(key: string) {
    const n = this.failures.get(key) ?? 0;
    return n >= this.max ? { blocked: true, retryAfterSeconds: 900 } : { blocked: false, retryAfterSeconds: 0 };
  }
  async recordFailure(key: string) {
    this.failures.set(key, (this.failures.get(key) ?? 0) + 1);
  }
  async reset(key: string) {
    this.failures.delete(key);
  }
}

export const fixedClock = { now: () => new Date('2026-11-10T12:00:00Z') };

export function sequentialIds() {
  let n = 0;
  return { uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
}
