import type { Clock, IdGenerator } from '../../shared/application/ports.js';
import { randomIds, systemClock } from '../../shared/application/ports.js';
import type { DbPool } from '../../shared/infrastructure/db/pool.js';
import { createUnitOfWork, inTransaction } from '../../shared/infrastructure/db/unit-of-work.js';
import type { EventConsumer } from '../../shared/infrastructure/outbox/consumer.js';
import type { TxClient } from '../../shared/infrastructure/db/pool.js';
import type { AfterLoginHook, AuthGuards } from '../../shared/infrastructure/http/auth.js';
import type { Logger } from '../../shared/infrastructure/observability/logger.js';
import type { Metrics } from '../../shared/infrastructure/observability/metrics.js';
import type { BoundedContext } from '../types.js';
import { CartService } from './application/cart-service.js';
import { cartProjection } from './infrastructure/cart-projection.js';
import { clearGuestCookie, guestCartId, registerCartRoutes } from './infrastructure/cart-routes.js';
import { PgCartReadModel, PgCartRepository, PgWriteCatalogLookup } from './infrastructure/persistence.js';

export interface CartModuleDeps {
  writeDb: DbPool;
  readDb: DbPool;
  guards: AuthGuards;
  metrics: Metrics;
  logger: Logger;
  secureCookie: boolean;
  clock?: Clock;
  ids?: IdGenerator;
  /** Intervalo del job de expiración de carritos de visitante (0 = deshabilitado). */
  expiryIntervalMs?: number;
}

export function createCartModule(d: CartModuleDeps) {
  const repos = (tx: TxClient) => ({ carts: new PgCartRepository(tx), catalog: new PgWriteCatalogLookup(tx) });
  const reader = new PgCartReadModel(d.readDb);
  const clock = d.clock ?? systemClock;
  const ids = d.ids ?? randomIds;
  const cart = new CartService({ uow: createUnitOfWork(d.writeDb, repos), reader, clock, ids });

  /** Política (write): tras un pago confirmado se vacía el carrito del comprador. Contrato: evento ordering.OrderPaid. */
  const clearOnOrderPaid: EventConsumer = {
    name: 'cart.clear-on-order-paid',
    target: 'write',
    handles: ['ordering.OrderPaid'],
    async apply(event, tx) {
      const { customerId, cartId } = (event.payload as { snapshot: { customerId: string | null; cartId: string | null } }).snapshot;
      const service = new CartService({ uow: inTransaction(tx, repos), reader, clock, ids });
      await service.clear(customerId ? { customerId } : { guestCartId: cartId });
    },
  };

  /** Al iniciar sesión, el carrito de visitante se combina con el del cliente. */
  const mergeOnLogin: AfterLoginHook = async (req, reply, customerId) => {
    const guestId = guestCartId(req);
    if (!guestId) return;
    await cart.mergeGuestCart(guestId, customerId);
    clearGuestCookie(reply, d.secureCookie);
  };

  let timer: NodeJS.Timeout | undefined;
  const context: BoundedContext = {
    consumers: [cartProjection, clearOnOrderPaid],
    appModule: {
      name: 'cart',
      register: async (app) => {
        await registerCartRoutes(app, { cart, guards: d.guards, metrics: d.metrics, secureCookie: d.secureCookie });
      },
    },
    onStart: async () => {
      const every = d.expiryIntervalMs ?? 3_600_000;
      if (every <= 0) return;
      timer = setInterval(() => {
        cart
          .expireGuestCarts()
          .then((n) => n && d.logger.info({ event: 'cart.guest_expired', count: n }, 'Carritos de visitante expirados'))
          .catch((err: unknown) => d.logger.error({ err }, 'Falló la expiración de carritos'));
      }, every);
      timer.unref();
    },
    stop: () => clearInterval(timer),
  };
  return { context, cart, mergeOnLogin, guestCartId };
}
