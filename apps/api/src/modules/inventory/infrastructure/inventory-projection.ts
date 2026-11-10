import type { EventConsumer } from '../../../shared/infrastructure/outbox/consumer.js';
import type { TxClient } from '../../../shared/infrastructure/db/pool.js';

interface StockPayload {
  variantId: string;
  productId: string;
  onHand: number;
  reserved: number;
}

/** Recalcula la disponibilidad agregada del producto a partir de sus variantes. */
export async function refreshProductAvailability(tx: TxClient, productId: string): Promise<void> {
  await tx.query(
    `UPDATE catalog_products p
        SET available = EXISTS (SELECT 1 FROM catalog_variants v WHERE v.product_id = p.id AND v.available_qty > 0),
            sizes = COALESCE((SELECT array_agg(DISTINCT v.size) FROM catalog_variants v WHERE v.product_id = p.id AND v.available_qty > 0), '{}')
      WHERE p.id = $1`,
    [productId],
  );
}

/** Proyecta el stock al modelo de lectura del catálogo (sin reescribir el documento del producto). */
export const inventoryProjection: EventConsumer = {
  name: 'inventory.catalog-stock',
  target: 'read',
  handles: [
    'inventory.InventoryItemCreated',
    'inventory.StockAdjusted',
    'inventory.StockReserved',
    'inventory.StockReleased',
    'inventory.StockCommitted',
    'inventory.StockRestocked',
  ],
  async apply(event, tx) {
    const p = event.payload as StockPayload;
    await tx.query(
      `UPDATE catalog_variants SET on_hand = $2::int, reserved = $3::int, available_qty = GREATEST($2::int - $3::int, 0) WHERE variant_id = $1`,
      [p.variantId, p.onHand, p.reserved],
    );
    await refreshProductAvailability(tx, p.productId);
    return { invalidate: [`catalog:product:${p.productId}`, 'catalog:list', 'catalog:home'] };
  },
};
