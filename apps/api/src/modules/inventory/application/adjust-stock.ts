import type { InventoryLevel } from '@radian/contracts';
import type { Clock } from '../../../shared/application/ports.js';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.js';
import { NotFoundError } from '../../../shared/domain/errors.js';
import type { AdjustmentReason, InventoryRepository } from '../domain/inventory-item.js';

export class AdjustStock {
  constructor(private readonly d: { uow: UnitOfWork<{ inventory: InventoryRepository }>; clock: Clock }) {}

  execute(input: { variantId: string; delta: number; reason: Exclude<AdjustmentReason, 'initial'>; actorId: string | null }): Promise<InventoryLevel> {
    return this.d.uow.run(async ({ inventory }) => {
      const item = await inventory.find(input.variantId);
      if (!item) throw new NotFoundError('VARIANT_NOT_FOUND', 'La variante no tiene inventario');
      item.adjust({ delta: input.delta, reason: input.reason, actorId: input.actorId }, this.d.clock.now());
      await inventory.save(item);
      const s = item.toSnapshot();
      return { variantId: s.variantId, onHand: s.onHand, reserved: s.reserved, available: s.available };
    });
  }
}
