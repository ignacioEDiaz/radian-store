import { ConflictError } from '../../../shared/domain/errors.js';
import type { SqlExecutor } from '../../../shared/infrastructure/db/pool.js';
import { appendToOutbox } from '../../../shared/infrastructure/outbox/outbox-writer.js';
import { InventoryItem, type InventoryEvent, type InventoryRepository } from '../domain/inventory-item.js';

interface Row {
  variant_id: string;
  product_id: string;
  sku: string;
  on_hand: number;
  reserved: number;
  version: number;
}

const toDomain = (r: Row) =>
  InventoryItem.rehydrate({ variantId: r.variant_id, productId: r.product_id, sku: r.sku, onHand: r.on_hand, reserved: r.reserved, version: r.version });

export class PgInventoryRepository implements InventoryRepository {
  constructor(private readonly db: SqlExecutor) {}

  async find(variantId: string) {
    const { rows } = await this.db.query<Row>('SELECT * FROM inventory_items WHERE variant_id = $1', [variantId]);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByProduct(productId: string) {
    const { rows } = await this.db.query<Row>('SELECT * FROM inventory_items WHERE product_id = $1', [productId]);
    return rows.map(toDomain);
  }

  async save(item: InventoryItem): Promise<void> {
    if (!item.hasChanges) return;
    const s = item.toSnapshot();
    if (item.persistedVersion === 0) {
      await this.db.query(
        'INSERT INTO inventory_items (variant_id, product_id, sku, on_hand, reserved, version) VALUES ($1, $2, $3, $4, $5, $6)',
        [s.variantId, s.productId, s.sku, s.onHand, s.reserved, s.version],
      );
    } else {
      const { rowCount } = await this.db.query(
        'UPDATE inventory_items SET on_hand = $2, reserved = $3, version = $4 WHERE variant_id = $1 AND version = $5',
        [s.variantId, s.onHand, s.reserved, s.version, item.persistedVersion],
      );
      if (rowCount === 0) throw new ConflictError('VERSION_CONFLICT', 'El stock cambió mientras se ajustaba; reintentá');
    }
    const events = item.pullEvents();
    for (const e of events as InventoryEvent[]) {
      const delta = e.type === 'inventory.StockAdjusted' ? e.payload.delta : e.payload.onHand;
      const reason = e.type === 'inventory.StockAdjusted' ? e.payload.reason : 'initial';
      const actor = e.type === 'inventory.StockAdjusted' ? e.payload.actorId : null;
      if (delta !== 0) {
        await this.db.query('INSERT INTO stock_movements (variant_id, delta, reason, actor_id, created_at) VALUES ($1, $2, $3, $4, $5)', [
          s.variantId,
          delta,
          reason,
          actor,
          e.occurredAt,
        ]);
      }
    }
    await appendToOutbox(this.db, events);
  }
}
