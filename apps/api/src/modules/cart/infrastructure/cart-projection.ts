import type { EventConsumer } from '../../../shared/infrastructure/outbox/consumer.js';
import { CART_EVENT_TYPES, type CartSnapshot } from '../domain/cart.js';

/** Snapshot del carrito en la base de lectura (solo avanza de versión). */
export const cartProjection: EventConsumer = {
  name: 'cart.snapshot',
  target: 'read',
  handles: CART_EVENT_TYPES,
  async apply(event, tx) {
    const s = (event.payload as { snapshot: CartSnapshot }).snapshot;
    if (event.type === 'cart.CartExpired') {
      await tx.query('DELETE FROM cart_snapshots WHERE cart_id = $1', [s.id]);
      return;
    }
    await tx.query(
      `INSERT INTO cart_snapshots (cart_id, customer_id, lines, version, updated_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (cart_id) DO UPDATE SET customer_id = EXCLUDED.customer_id, lines = EXCLUDED.lines, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at
       WHERE cart_snapshots.version < EXCLUDED.version`,
      [s.id, s.customerId, JSON.stringify(s.lines), s.version, s.updatedAt],
    );
  },
};
