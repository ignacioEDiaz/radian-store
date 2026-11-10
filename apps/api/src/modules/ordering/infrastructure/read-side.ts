import type { OrderDetail, OrderStatus, OrderSummary } from '@radian/contracts';
import { NotFoundError } from '../../../shared/domain/errors.js';
import type { SqlExecutor } from '../../../shared/infrastructure/db/pool.js';
import type { EventConsumer } from '../../../shared/infrastructure/outbox/consumer.js';
import { ORDER_EVENT_TYPES, type OrderSnapshot } from '../domain/order.js';
import { toOrderDetail, toOrderSummary } from '../application/views.js';

/** Vista de pedidos para historial y administración (base de lectura). */
export const orderViewProjection: EventConsumer = {
  name: 'ordering.order-views',
  target: 'read',
  handles: ORDER_EVENT_TYPES,
  async apply(event, tx) {
    const s = (event.payload as { snapshot: OrderSnapshot }).snapshot;
    const summary = toOrderSummary(s);
    await tx.query(
      `INSERT INTO order_views (id, number, customer_id, email, status, total_cents, item_count, placed_at, doc, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, doc = EXCLUDED.doc, version = EXCLUDED.version
       WHERE order_views.version < EXCLUDED.version`,
      [s.id, s.number, s.customerId, s.email, s.status, summary.totalCents, summary.itemCount, s.placedAt, JSON.stringify(toOrderDetail(s)), s.version],
    );
  },
};

/** Ventas reales alimentan el ranking de "más vendidos" del catálogo. */
export const salesCountProjection: EventConsumer = {
  name: 'ordering.sales-count',
  target: 'read',
  handles: ['ordering.OrderPaid'],
  async apply(event, tx) {
    const s = (event.payload as { snapshot: OrderSnapshot }).snapshot;
    for (const l of s.lines) {
      await tx.query('UPDATE catalog_products SET sales_count = sales_count + $2 WHERE id = $1', [l.productId, l.quantity]);
    }
    return { invalidate: ['catalog:home', 'catalog:list'] };
  },
};

const PAGE = { mine: 10, admin: 20 };

export class OrderQueries {
  constructor(private readonly readDb: SqlExecutor) {}

  async listMine(customerId: string, page: number) {
    return this.page('customer_id = $1', [customerId], page, PAGE.mine);
  }

  async getMine(customerId: string, number: string): Promise<OrderDetail> {
    const { rows } = await this.readDb.query<{ doc: OrderDetail }>('SELECT doc FROM order_views WHERE number = $1 AND customer_id = $2', [number, customerId]);
    if (!rows[0]) throw new NotFoundError('ORDER_NOT_FOUND', 'El pedido no existe');
    return rows[0].doc;
  }

  async listAdmin(status: OrderStatus | undefined, page: number) {
    return this.page('($1::text IS NULL OR status = $1)', [status ?? null], page, PAGE.admin);
  }

  async getAdmin(number: string): Promise<OrderDetail> {
    const { rows } = await this.readDb.query<{ doc: OrderDetail }>('SELECT doc FROM order_views WHERE number = $1', [number]);
    if (!rows[0]) throw new NotFoundError('ORDER_NOT_FOUND', 'El pedido no existe');
    return rows[0].doc;
  }

  private async page(where: string, params: unknown[], page: number, pageSize: number) {
    const { rows } = await this.readDb.query<{ id: string; number: string; status: OrderStatus; email: string; total_cents: number; item_count: number; placed_at: Date; total: string }>(
      `SELECT id, number, status, email, total_cents, item_count, placed_at, count(*) OVER () AS total
         FROM order_views WHERE ${where} ORDER BY placed_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    );
    const items: OrderSummary[] = rows.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      email: r.email,
      totalCents: r.total_cents,
      itemCount: r.item_count,
      placedAt: new Date(r.placed_at).toISOString(),
    }));
    return { items, total: Number(rows[0]?.total ?? 0), page, pageSize };
  }
}
