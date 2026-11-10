import { createCartModule } from './cart/index.js';
import { createCatalogModule } from './catalog/index.js';
import { createIdentityModule } from './identity/index.js';
import { createInventoryModule } from './inventory/index.js';
import { createMediaModule } from './media/index.js';
import { createOrderingModule } from './ordering/index.js';
import { FakePaymentGateway } from './ordering/infrastructure/fake-payment-gateway.js';
import type { BoundedContext, ModuleContext } from './types.js';

export type { BoundedContext, ModuleContext } from './types.js';

/** Composition root: crea cada bounded context y les inyecta lo que necesitan de los demás. */
export function createContexts(ctx: ModuleContext): BoundedContext[] {
  const { writeDb, readDb } = ctx.infra;
  const identity = createIdentityModule(ctx, ctx.infra.redis);
  const guards = identity.guards;
  const media = createMediaModule({ writeDb, guards, metrics: ctx.metrics, mediaDir: ctx.config.mediaDir });
  const inventory = createInventoryModule({ writeDb, guards });
  const catalog = createCatalogModule({ writeDb, readDb, guards, cache: ctx.infra.cache });
  const cart = createCartModule({ writeDb, readDb, guards, metrics: ctx.metrics, logger: ctx.logger, secureCookie: ctx.config.session.secureCookie });
  identity.afterLogin.push(cart.mergeOnLogin);
  const ordering = createOrderingModule({ writeDb, readDb, guards, metrics: ctx.metrics, logger: ctx.logger, guestCartId: cart.guestCartId,
    payments: new FakePaymentGateway({ timeoutMs: ctx.config.payments.timeoutMs }),
  });
  return [identity, media.context, inventory, catalog.context, cart.context, ordering.context];
}
