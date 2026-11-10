import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { stockAdjustmentRequestSchema } from '@radian/contracts';
import type { Clock } from '../../shared/application/ports.js';
import { systemClock } from '../../shared/application/ports.js';
import type { DbPool } from '../../shared/infrastructure/db/pool.js';
import { createUnitOfWork } from '../../shared/infrastructure/db/unit-of-work.js';
import type { AuthGuards } from '../../shared/infrastructure/http/auth.js';
import { parseBody, parseParams } from '../../shared/infrastructure/http/validation.js';
import type { BoundedContext } from '../types.js';
import { AdjustStock } from './application/adjust-stock.js';
import { inventoryProjection } from './infrastructure/inventory-projection.js';
import { PgInventoryRepository } from './infrastructure/pg-inventory-repository.js';

/** Contexto inventory: ajustes de stock (admin) y proyección de disponibilidad. */
export function createInventoryModule(d: { writeDb: DbPool; guards: AuthGuards; clock?: Clock }): BoundedContext & { adjustStock: AdjustStock } {
  const adjustStock = new AdjustStock({
    uow: createUnitOfWork(d.writeDb, (tx) => ({ inventory: new PgInventoryRepository(tx) })),
    clock: d.clock ?? systemClock,
  });
  return {
    adjustStock,
    consumers: [inventoryProjection],
    appModule: {
      name: 'inventory',
      register: (app: FastifyInstance) => {
        app.post('/api/admin/inventory/:variantId/adjustments', { preHandler: d.guards.requireRole('admin') }, async (req) => {
          const { variantId } = parseParams(z.object({ variantId: z.uuid() }), req.params);
          const body = parseBody(stockAdjustmentRequestSchema, req.body);
          return adjustStock.execute({ variantId, delta: body.delta, reason: body.reason, actorId: req.auth?.customerId ?? null });
        });
      },
    },
  };
}
