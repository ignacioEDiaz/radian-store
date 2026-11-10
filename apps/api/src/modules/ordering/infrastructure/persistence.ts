import type { Clock } from '../../../shared/application/ports.js';
import { ConflictError } from '../../../shared/domain/errors.js';
import type { DbPool, SqlExecutor } from '../../../shared/infrastructure/db/pool.js';
import { isUniqueViolation } from '../../../shared/infrastructure/db/pg-errors.js';
import { appendToOutbox } from '../../../shared/infrastructure/outbox/outbox-writer.js';
import { PgStockReservations } from '../../inventory/infrastructure/pg-stock-reservations.js';
import { DiscountCode } from '../domain/discount-code.js';
import { Order, type OrderSnapshot } from '../domain/order.js';
import type { CheckoutPorts, DiscountRepository, IdempotencyBegin, IdempotencyStore, OrderRepository, PricedVariant } from '../application/ports.js';

/** El pedido se guarda como documento (snapshot) + columnas para buscar/bloquear. */
export class PgOrderRepository implements OrderRepository {
  constructor(private readonly db: SqlExecutor) {}

  private async one(where: string, param: string) {
    const { rows } = await this.db.query<{ doc: OrderSnapshot }>(`SELECT doc FROM orders WHERE ${where} FOR UPDATE`, [param]);
    return rows[0] ? Order.rehydrate(revive(rows[0].doc)) : null;
  }

  findById(id: string) {
    return this.one('id = $1', id);
  }

  findByNumber(number: string) {
    return this.one('number = $1', number);
  }

  async expiredPending(now: Date, limit: number) {
    const { rows } = await this.db.query<{ doc: OrderSnapshot }>(
      `SELECT doc FROM orders WHERE status = 'pending_payment' AND reservation_expires_at < $1 ORDER BY reservation_expires_at LIMIT $2 FOR UPDATE SKIP LOCKED`,
      [now, limit],
    );
    return rows.map((r) => Order.rehydrate(revive(r.doc)));
  }

  async save(order: Order): Promise<void> {
    if (!order.hasChanges) return;
    const s = order.toSnapshot();
    if (order.persistedVersion === 0) {
      await this.db.query(
        `INSERT INTO orders (id, number, customer_id, cart_id, email, status, doc, total_cents, reservation_expires_at, version, placed_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [s.id, s.number, s.customerId, s.cartId, s.email, s.status, JSON.stringify(s), s.totals.totalCents, s.reservationExpiresAt, s.version, s.placedAt, s.updatedAt],
      );
    } else {
      const { rowCount } = await this.db.query('UPDATE orders SET status = $2, doc = $3, version = $4, updated_at = $5 WHERE id = $1 AND version = $6', [
        s.id,
        s.status,
        JSON.stringify(s),
        s.version,
        s.updatedAt,
        order.persistedVersion,
      ]);
      if (rowCount === 0) throw new ConflictError('VERSION_CONFLICT', 'El pedido fue modificado por otra operación');
    }
    await appendToOutbox(this.db, order.pullEvents());
  }
}

/** El snapshot viaja como JSON: las fechas vuelven a ser Date. */
function revive(doc: OrderSnapshot): OrderSnapshot {
  return {
    ...doc,
    reservationExpiresAt: new Date(doc.reservationExpiresAt),
    placedAt: new Date(doc.placedAt),
    updatedAt: new Date(doc.updatedAt),
    history: doc.history.map((h) => ({ ...h, at: new Date(h.at) })),
  };
}

export class PgDiscountRepository implements DiscountRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findByCode(code: string) {
    const { rows } = await this.db.query<{
      id: string;
      code: string;
      kind: 'percent' | 'fixed';
      value: number;
      starts_at: Date | null;
      ends_at: Date | null;
      min_subtotal_cents: number | null;
      once_per_email: boolean;
      active: boolean;
    }>('SELECT * FROM discount_codes WHERE code = $1', [code]);
    const r = rows[0];
    return r
      ? DiscountCode.rehydrate({ id: r.id, code: r.code, kind: r.kind, value: r.value, startsAt: r.starts_at, endsAt: r.ends_at, minSubtotalCents: r.min_subtotal_cents, oncePerEmail: r.once_per_email, active: r.active })
      : null;
  }

  async usedBy(codeId: string, email: string) {
    const { rows } = await this.db.query('SELECT 1 FROM discount_redemptions WHERE code_id = $1 AND email = $2 LIMIT 1', [codeId, email]);
    return rows.length > 0;
  }

  async redeem(codeId: string, email: string, orderId: string, at: Date) {
    await this.db.query('INSERT INTO discount_redemptions (code_id, email, order_id, redeemed_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [codeId, email, orderId, at]);
  }
}

/** Puertos del checkout ligados a una transacción de la base de escritura. */
export function checkoutPorts(tx: SqlExecutor, clock: Clock): CheckoutPorts {
  const reservations = new PgStockReservations(tx, clock);
  return {
    async cart({ customerId, cartId }) {
      const { rows } = await tx.query<{ id: string; lines: { variantId: string; quantity: number }[] }>(
        `SELECT c.id, COALESCE((SELECT json_agg(json_build_object('variantId', l.variant_id, 'quantity', l.quantity) ORDER BY l.position)
                                 FROM cart_lines l WHERE l.cart_id = c.id), '[]') AS lines
           FROM carts c WHERE ${customerId ? 'c.customer_id = $1' : 'c.id = $1 AND c.customer_id IS NULL'}`,
        [customerId ?? cartId],
      );
      return rows[0] ? { cartId: rows[0].id, lines: rows[0].lines } : null;
    },
    async pricing(variantIds) {
      const { rows } = await tx.query<{
        variant_id: string;
        product_id: string;
        sku: string;
        title: string;
        color: string;
        size: string;
        price_cents: number;
        published: boolean;
        available: number;
        media_id: string | null;
        widths: number[] | null;
      }>(
        `SELECT v.id AS variant_id, v.product_id, v.sku, p.title, v.color, v.size, COALESCE(v.price_cents, p.price_cents) AS price_cents,
                p.status = 'published' AS published, COALESCE(i.on_hand - i.reserved, 0) AS available, im.media_id, im.widths
           FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN inventory_items i ON i.variant_id = v.id
           LEFT JOIN LATERAL (SELECT media_id, widths FROM product_images WHERE product_id = p.id ORDER BY (color = v.color) DESC NULLS LAST, position LIMIT 1) im ON true
          WHERE v.id = ANY($1::uuid[])`,
        [variantIds],
      );
      return new Map<string, PricedVariant>(
        rows.map((r) => [
          r.variant_id,
          {
            variantId: r.variant_id,
            productId: r.product_id,
            sku: r.sku,
            title: r.title,
            color: r.color,
            size: r.size,
            imageUrl: r.media_id && r.widths ? `/media/${r.media_id}/${Math.min(...r.widths.filter((w) => w >= 320), Math.max(...r.widths))}.webp` : null,
            priceCents: r.price_cents,
            published: r.published,
            available: Math.max(0, r.available),
          },
        ]),
      );
    },
    reserve: (orderId, lines, expiresAt) => reservations.reserve(orderId, lines, expiresAt),
    commit: (orderId) => reservations.commit(orderId),
    release: (orderId) => reservations.release(orderId),
    restock: (orderId) => reservations.restock(orderId),
    orders: new PgOrderRepository(tx),
    discounts: new PgDiscountRepository(tx),
    async nextOrderNumber() {
      const { rows } = await tx.query<{ n: string }>(`SELECT nextval('order_number_seq') AS n`);
      return `RS-${String(rows[0]!.n).padStart(6, '0')}`;
    },
  };
}

/** Claves de idempotencia en su propia transacción corta (fuera de la del pedido). */
export class PgIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: DbPool) {}

  async begin(scope: string, key: string, requestHash: string): Promise<IdempotencyBegin> {
    try {
      await this.db.query(`INSERT INTO idempotency_keys (scope, key, request_hash, status) VALUES ($1, $2, $3, 'processing')`, [scope, key, requestHash]);
      return { state: 'new' };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    const { rows } = await this.db.query<{ request_hash: string; status: string; http_status: number | null; response: unknown }>(
      'SELECT request_hash, status, http_status, response FROM idempotency_keys WHERE scope = $1 AND key = $2',
      [scope, key],
    );
    const row = rows[0];
    if (!row) return this.begin(scope, key, requestHash); // se liberó entre medio
    if (row.request_hash !== requestHash) return { state: 'mismatch' };
    if (row.status === 'processing') return { state: 'processing' };
    return { state: 'completed', httpStatus: row.http_status ?? 200, response: row.response };
  }

  async complete(scope: string, key: string, httpStatus: number, response: unknown) {
    await this.db.query(`UPDATE idempotency_keys SET status = 'completed', http_status = $3, response = $4 WHERE scope = $1 AND key = $2`, [scope, key, httpStatus, JSON.stringify(response)]);
  }

  async abandon(scope: string, key: string) {
    await this.db.query(`DELETE FROM idempotency_keys WHERE scope = $1 AND key = $2 AND status = 'processing'`, [scope, key]);
  }
}
