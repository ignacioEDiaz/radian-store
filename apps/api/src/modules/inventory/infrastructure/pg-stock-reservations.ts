import { randomUUID } from 'node:crypto';
import type { Clock } from '../../../shared/application/ports.js';
import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import { DomainError } from '../../../shared/domain/errors.js';
import type { SqlExecutor } from '../../../shared/infrastructure/db/pool.js';
import { appendToOutbox } from '../../../shared/infrastructure/outbox/outbox-writer.js';

interface StockRow {
  variant_id: string;
  product_id: string;
  sku: string;
  on_hand: number;
  reserved: number;
  version: number;
}

type StockEventType = 'inventory.StockReserved' | 'inventory.StockCommitted' | 'inventory.StockReleased' | 'inventory.StockRestocked';

/**
 * Reservas de stock para el checkout (adaptador de inventory para el puerto de ordering).
 * Cada línea es un UPDATE condicional atómico (`on_hand - reserved >= q`): el lock de fila
 * serializa a quienes compiten por la misma variante, y el orden fijo por variant_id evita deadlocks.
 * Corre dentro de la transacción que recibe: si una línea falla, el rollback deshace las demás.
 */
export class PgStockReservations {
  constructor(private readonly db: SqlExecutor, private readonly clock: Clock) {}

  async reserve(orderId: string, lines: { variantId: string; quantity: number }[], expiresAt: Date): Promise<void> {
    const sorted = [...lines].sort((x, y) => x.variantId.localeCompare(y.variantId));
    const events: DomainEvent[] = [];
    const missing: { variantId: string; available: number }[] = [];
    for (const l of sorted) {
      const { rows } = await this.db.query<StockRow>(
        `UPDATE inventory_items SET reserved = reserved + $2, version = version + 1
          WHERE variant_id = $1 AND on_hand - reserved >= $2
          RETURNING variant_id, product_id, sku, on_hand, reserved, version`,
        [l.variantId, l.quantity],
      );
      if (!rows[0]) {
        const current = await this.db.query<{ available: number }>('SELECT on_hand - reserved AS available FROM inventory_items WHERE variant_id = $1', [l.variantId]);
        missing.push({ variantId: l.variantId, available: Math.max(0, current.rows[0]?.available ?? 0) });
        continue;
      }
      events.push(this.event('inventory.StockReserved', rows[0], orderId, l.quantity));
    }
    if (missing.length) {
      throw new DomainError('INSUFFICIENT_STOCK', 'Algunos productos ya no tienen stock suficiente', { lines: missing });
    }
    for (const l of sorted) {
      await this.db.query(`INSERT INTO stock_reservations (order_id, variant_id, quantity, status, expires_at) VALUES ($1, $2, $3, 'active', $4)`, [
        orderId,
        l.variantId,
        l.quantity,
        expiresAt,
      ]);
    }
    await appendToOutbox(this.db, events);
  }

  /** Pago confirmado: lo reservado sale del stock físico. */
  commit(orderId: string) {
    return this.settle(orderId, 'active', 'committed', 'on_hand = on_hand - r.quantity, reserved = reserved - r.quantity', 'inventory.StockCommitted', (q) => -q, 'sale');
  }

  /** Pago rechazado o reserva vencida: se libera lo reservado. */
  release(orderId: string) {
    return this.settle(orderId, 'active', 'released', 'reserved = reserved - r.quantity', 'inventory.StockReleased', null, null);
  }

  /** Cancelación de un pedido pagado: vuelve al stock físico. */
  restock(orderId: string) {
    return this.settle(orderId, 'committed', 'restocked', 'on_hand = on_hand + r.quantity', 'inventory.StockRestocked', (q) => q, 'return');
  }

  private async settle(
    orderId: string,
    from: string,
    to: string,
    set: string,
    type: StockEventType,
    movement: ((q: number) => number) | null,
    reason: string | null,
  ): Promise<void> {
    const { rows } = await this.db.query<StockRow & { quantity: number }>(
      `WITH r AS (
         UPDATE stock_reservations SET status = $3 WHERE order_id = $1 AND status = $2 RETURNING variant_id, quantity
       )
       UPDATE inventory_items i SET ${set}, version = i.version + 1
         FROM r WHERE i.variant_id = r.variant_id
       RETURNING i.variant_id, i.product_id, i.sku, i.on_hand, i.reserved, i.version, r.quantity`,
      [orderId, from, to],
    );
    const now = this.clock.now();
    for (const row of rows) {
      if (movement && reason) {
        await this.db.query('INSERT INTO stock_movements (variant_id, delta, reason, order_id, created_at) VALUES ($1, $2, $3, $4, $5)', [
          row.variant_id,
          movement(row.quantity),
          reason,
          orderId,
          now,
        ]);
      }
    }
    await appendToOutbox(this.db, rows.map((r) => this.event(type, r, orderId, r.quantity)));
  }

  private event(type: StockEventType, r: StockRow, orderId: string, quantity: number): DomainEvent {
    return {
      eventId: randomUUID(),
      type,
      aggregateType: 'InventoryItem',
      aggregateId: r.variant_id,
      aggregateVersion: r.version,
      occurredAt: this.clock.now(),
      payload: { variantId: r.variant_id, productId: r.product_id, sku: r.sku, onHand: r.on_hand, reserved: r.reserved, orderId, quantity },
    };
  }
}
