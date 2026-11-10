import type { Clock } from '../../../shared/application/ports.js';
import type { SqlExecutor } from '../../../shared/infrastructure/db/pool.js';
import { InventoryItem } from '../domain/inventory-item.js';
import { PgInventoryRepository } from './pg-inventory-repository.js';

/**
 * Adaptador que el contexto inventory ofrece a catalog (puerto `InventoryProvisioner`).
 * Corre en la transacción que recibe, así la variante y su stock nacen juntos.
 */
export class PgInventoryProvisioner {
  private readonly repo: PgInventoryRepository;

  constructor(db: SqlExecutor, private readonly clock: Clock) {
    this.repo = new PgInventoryRepository(db);
  }

  async provision(input: { variantId: string; productId: string; sku: string; onHand: number }): Promise<void> {
    if (await this.repo.find(input.variantId)) return;
    await this.repo.save(InventoryItem.create({ ...input, now: this.clock.now() }));
  }

  async levels(productId: string): Promise<Map<string, { onHand: number; reserved: number }>> {
    const items = await this.repo.findByProduct(productId);
    return new Map(items.map((i) => [i.id, { onHand: i.toSnapshot().onHand, reserved: i.toSnapshot().reserved }]));
  }
}
