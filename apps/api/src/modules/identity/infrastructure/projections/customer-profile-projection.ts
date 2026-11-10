import type { EventConsumer } from '../../../../shared/infrastructure/outbox/consumer.js';
import type { CustomerSnapshot } from '../../domain/events.js';
import { customerTag } from '../../application/queries/get-my-profile.js';

/** Proyecta el snapshot de la cuenta a `customer_profiles` (solo avanza de versión: tolera desorden). */
export const customerProfileProjection: EventConsumer = {
  name: 'identity.customer-profile',
  target: 'read',
  handles: ['identity.CustomerRegistered', 'identity.CustomerProfileUpdated', 'identity.CustomerRoleChanged', 'identity.CustomerDeactivated'],
  async apply(event, tx) {
    const s = (event.payload as { snapshot: CustomerSnapshot }).snapshot;
    await tx.query(
      `INSERT INTO customer_profiles (id, email, name, role, status, default_address, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role, status = EXCLUDED.status,
         default_address = EXCLUDED.default_address, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at
       WHERE customer_profiles.version < EXCLUDED.version`,
      [s.id, s.email, s.name, s.role, s.status, s.defaultAddress ? JSON.stringify(s.defaultAddress) : null, s.version, s.createdAt, s.updatedAt],
    );
    return { invalidate: [customerTag(s.id)] };
  },
};
