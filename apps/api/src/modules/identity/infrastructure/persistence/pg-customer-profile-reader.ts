import type { Profile } from '@radian/contracts';
import type { SqlExecutor } from '../../../../shared/infrastructure/db/pool.js';
import type { CustomerProfileReader } from '../../application/ports.js';
import type { CustomerStatus, Role } from '../../domain/events.js';

/** Lecturas de identity sobre la base de lectura. */
export class PgCustomerProfileReader implements CustomerProfileReader {
  constructor(private readonly readDb: SqlExecutor) {}

  async findProfile(id: string): Promise<Profile | null> {
    const { rows } = await this.readDb.query<Profile & { default_address: Profile['defaultAddress'] }>(
      'SELECT id, email, name, role, default_address FROM customer_profiles WHERE id = $1',
      [id],
    );
    const r = rows[0];
    return r ? { id: r.id, email: r.email, name: r.name, role: r.role, defaultAddress: r.default_address ?? null } : null;
  }

  async findAuth(id: string): Promise<{ id: string; role: Role; status: CustomerStatus } | null> {
    const { rows } = await this.readDb.query<{ id: string; role: Role; status: CustomerStatus }>(
      'SELECT id, role, status FROM customer_profiles WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  }
}
