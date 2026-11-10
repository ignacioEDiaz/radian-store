import type { Clock, IdGenerator } from '../../../../shared/application/ports.js';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import { Customer } from '../../domain/customer.js';
import { Email } from '../../domain/email.js';
import type { Role } from '../../domain/events.js';
import type { PasswordHasher } from '../../domain/password-hasher.js';
import type { IdentityRepos } from '../ports.js';

const DEFAULT_NAMES: Record<Exclude<Role, 'customer'>, string> = { admin: 'Administración', viewer: 'Demo (solo lectura)' };

/**
 * Garantiza una cuenta de staff configurada (admin o viewer de solo lectura). Idempotente:
 * se ejecuta al arrancar; si la cuenta existe solo ajusta el rol (nunca toca la contraseña).
 */
export class EnsureStaffAccount {
  constructor(private readonly deps: { uow: UnitOfWork<IdentityRepos>; hasher: PasswordHasher; clock: Clock; ids: IdGenerator }) {}

  async execute(input: { email: string; password: string; role: 'admin' | 'viewer'; name?: string | undefined }): Promise<void> {
    const email = Email.create(input.email);
    const existing = await this.deps.uow.run(({ customers }) => customers.findByEmail(email));
    if (existing?.role === input.role) return;
    const passwordHash = existing ? '' : await this.deps.hasher.hash(input.password);
    await this.deps.uow.run(async ({ customers }) => {
      const current = await customers.findByEmail(email);
      const now = this.deps.clock.now();
      if (current) {
        current.changeRole(input.role, now);
        await customers.save(current);
        return;
      }
      await customers.save(
        Customer.register({ id: this.deps.ids.uuid(), email, name: input.name ?? DEFAULT_NAMES[input.role], passwordHash, role: input.role, now }),
      );
    });
  }
}
