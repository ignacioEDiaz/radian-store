import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import { DomainError } from '../../../shared/domain/errors.js';

export type AdjustmentReason = 'restock' | 'correction' | 'damage' | 'other' | 'initial';

export interface InventorySnapshot {
  variantId: string;
  productId: string;
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
  version: number;
}

type Stock = { variantId: string; productId: string; sku: string; onHand: number; reserved: number };

export type InventoryEvent =
  | DomainEvent<'inventory.InventoryItemCreated', Stock>
  | DomainEvent<'inventory.StockAdjusted', Stock & { delta: number; reason: AdjustmentReason; actorId: string | null }>;

/** Stock de una variante: físico (`onHand`) y comprometido por pedidos (`reserved`). */
export class InventoryItem extends AggregateRoot<InventoryEvent> {
  readonly aggregateType = 'InventoryItem';

  private constructor(version: number, private s: Stock) {
    super(s.variantId, version);
  }

  static create(input: { variantId: string; productId: string; sku: string; onHand: number; now: Date }): InventoryItem {
    if (!Number.isInteger(input.onHand) || input.onHand < 0) throw new DomainError('NEGATIVE_STOCK', 'El stock no puede ser negativo');
    const item = new InventoryItem(0, { variantId: input.variantId, productId: input.productId, sku: input.sku, onHand: input.onHand, reserved: 0 });
    item.record('inventory.InventoryItemCreated', { ...item.s }, input.now);
    return item;
  }

  static rehydrate(row: Omit<InventorySnapshot, 'available'>): InventoryItem {
    const { version, ...stock } = row;
    return new InventoryItem(version, stock);
  }

  adjust(input: { delta: number; reason: AdjustmentReason; actorId: string | null }, now: Date): void {
    if (!Number.isInteger(input.delta) || input.delta === 0) throw new DomainError('INVALID_ADJUSTMENT', 'El ajuste debe ser un entero distinto de 0');
    const onHand = this.s.onHand + input.delta;
    if (onHand < 0 || onHand < this.s.reserved) {
      throw new DomainError('NEGATIVE_STOCK', 'El ajuste dejaría stock negativo o menor a lo reservado', { onHand: this.s.onHand, reserved: this.s.reserved });
    }
    this.s = { ...this.s, onHand };
    this.record('inventory.StockAdjusted', { ...this.s, delta: input.delta, reason: input.reason, actorId: input.actorId }, now);
  }

  toSnapshot(): InventorySnapshot {
    return { ...this.s, available: this.s.onHand - this.s.reserved, version: this.version };
  }
}

export interface InventoryRepository {
  find(variantId: string): Promise<InventoryItem | null>;
  findByProduct(productId: string): Promise<InventoryItem[]>;
  save(item: InventoryItem): Promise<void>;
}
