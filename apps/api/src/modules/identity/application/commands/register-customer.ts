import type { Profile } from '@radian/contracts';
import type { Clock, IdGenerator } from '../../../../shared/application/ports.js';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import { ConflictError } from '../../../../shared/domain/errors.js';
import { Customer } from '../../domain/customer.js';
import { Email } from '../../domain/email.js';
import type { PasswordHasher } from '../../domain/password-hasher.js';
import type { IdentityRepos } from '../ports.js';
import { toProfile } from '../profile.js';

export interface RegisterCustomerInput {
  name: string;
  email: string;
  password: string;
}

export class RegisterCustomer {
  constructor(private readonly deps: { uow: UnitOfWork<IdentityRepos>; hasher: PasswordHasher; clock: Clock; ids: IdGenerator }) {}

  async execute(input: RegisterCustomerInput): Promise<Profile> {
    const email = Email.create(input.email);
    const passwordHash = await this.deps.hasher.hash(input.password);
    return this.deps.uow.run(async ({ customers }) => {
      if (await customers.findByEmail(email)) throw new ConflictError('EMAIL_TAKEN', 'Ese email ya está registrado');
      const customer = Customer.register({ id: this.deps.ids.uuid(), email, name: input.name, passwordHash, now: this.deps.clock.now() });
      await customers.save(customer); // el índice único resuelve registros concurrentes
      return toProfile(customer);
    });
  }
}
