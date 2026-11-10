import type { Clock, IdGenerator } from '../../../../shared/application/ports.js';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import { Customer } from '../../domain/customer.js';
import { Email } from '../../domain/email.js';
import type { PasswordHasher } from '../../domain/password-hasher.js';
import type { IdentityRepos } from '../ports.js';

/** Garantiza la cuenta administradora inicial (idempotente, se ejecuta al arrancar). */
export class EnsureAdmin {
  constructor(private readonly deps: { uow: UnitOfWork<IdentityRepos>; hasher: PasswordHasher; clock: Clock; ids: IdGenerator }) {}

  async execute(input: { email: string; password: string; name?: string }): Promise<void> {
    const email = Email.create(input.email);
    const existing = await this.deps.uow.run(({ customers }) => customers.findByEmail(email));
    if (existing?.role === 'admin') return;
    const passwordHash = existing ? '' : await this.deps.hasher.hash(input.password);
    await this.deps.uow.run(async ({ customers }) => {
      const current = await customers.findByEmail(email);
      const now = this.deps.clock.now();
      if (current) {
        current.promoteToAdmin(now);
        await customers.save(current);
        return;
      }
      await customers.save(
        Customer.register({ id: this.deps.ids.uuid(), email, name: input.name ?? 'Administración', passwordHash, role: 'admin', now }),
      );
    });
  }
}
