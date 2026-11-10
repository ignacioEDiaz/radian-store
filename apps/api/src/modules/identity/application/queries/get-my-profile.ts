import type { Profile } from '@radian/contracts';
import type { Cache } from '../../../../shared/application/cache.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import type { CustomerProfileReader } from '../ports.js';

export const customerTag = (id: string) => `customer:${id}`;

/** Consulta del perfil propio (modelo de lectura + caché). */
export class GetMyProfile {
  constructor(private readonly deps: { reader: CustomerProfileReader; cache: Cache }) {}

  async execute(input: { customerId: string }): Promise<Profile> {
    const profile = await this.deps.cache.wrap(
      'identity.profile',
      `identity:profile:${input.customerId}`,
      { tags: [customerTag(input.customerId)], ttlSeconds: 60 },
      () => this.deps.reader.findProfile(input.customerId),
    );
    if (!profile) throw new NotFoundError('CUSTOMER_NOT_FOUND', 'La cuenta no existe');
    return profile;
  }
}
