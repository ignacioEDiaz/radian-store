import type { Address as AddressDto, Profile } from '@radian/contracts';
import type { Clock } from '../../../../shared/application/ports.js';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import { Address } from '../../domain/address.js';
import type { IdentityRepos } from '../ports.js';
import { toProfile } from '../profile.js';

export interface UpdateProfileInput {
  customerId: string;
  name?: string | undefined;
  defaultAddress?: AddressDto | null | undefined;
}

export class UpdateProfile {
  constructor(private readonly deps: { uow: UnitOfWork<IdentityRepos>; clock: Clock }) {}

  async execute(input: UpdateProfileInput): Promise<Profile> {
    return this.deps.uow.run(async ({ customers }) => {
      const customer = await customers.findById(input.customerId);
      if (!customer) throw new NotFoundError('CUSTOMER_NOT_FOUND', 'La cuenta no existe');
      customer.updateProfile(
        {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.defaultAddress !== undefined
            ? { defaultAddress: input.defaultAddress === null ? null : Address.create(input.defaultAddress) }
            : {}),
        },
        this.deps.clock.now(),
      );
      await customers.save(customer);
      return toProfile(customer);
    });
  }
}
