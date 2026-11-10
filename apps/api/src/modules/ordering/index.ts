import type { FastifyRequest } from 'fastify';
import type { Clock, IdGenerator } from '../../shared/application/ports.js';
import { randomIds, systemClock } from '../../shared/application/ports.js';
import type { DbPool } from '../../shared/infrastructure/db/pool.js';
import { createUnitOfWork } from '../../shared/infrastructure/db/unit-of-work.js';
import type { AuthGuards } from '../../shared/infrastructure/http/auth.js';
import type { Logger } from '../../shared/infrastructure/observability/logger.js';
import type { Metrics } from '../../shared/infrastructure/observability/metrics.js';
import type { BoundedContext } from '../types.js';
import { CheckoutService, OrderAdmin } from './application/checkout-service.js';
import type { PaymentGateway } from './application/ports.js';
import { FakePaymentGateway } from './infrastructure/fake-payment-gateway.js';
import { PgIdempotencyStore, checkoutPorts } from './infrastructure/persistence.js';
import { OrderQueries, orderViewProjection, salesCountProjection } from './infrastructure/read-side.js';
import { registerOrderingRoutes } from './infrastructure/routes.js';

export interface OrderingModuleDeps {
  writeDb: DbPool;
  readDb: DbPool;
  guards: AuthGuards;
  metrics: Metrics;
  logger: Logger;
  guestCartId: (req: FastifyRequest) => string | null;
  payments?: PaymentGateway;
  clock?: Clock;
  ids?: IdGenerator;
  /** Cada cuánto se liberan reservas vencidas (0 = deshabilitado). */
  expiryIntervalMs?: number;
}

export function createOrderingModule(d: OrderingModuleDeps) {
  const clock = d.clock ?? systemClock;
  const uow = createUnitOfWork(d.writeDb, (tx) => checkoutPorts(tx, clock));
  const payments = d.payments ?? new FakePaymentGateway({ timeoutMs: 5000 });
  const checkout = new CheckoutService({
    uow,
    idempotency: new PgIdempotencyStore(d.writeDb),
    payments,
    clock,
    ids: d.ids ?? randomIds,
    metrics: { ordersPlaced: d.metrics.ordersPlaced, paymentAttempts: d.metrics.paymentAttempts },
  });
  const admin = new OrderAdmin({ uow, payments, clock });
  const queries = new OrderQueries(d.readDb);

  let timer: NodeJS.Timeout | undefined;
  const context: BoundedContext = {
    consumers: [orderViewProjection, salesCountProjection],
    appModule: {
      name: 'ordering',
      register: async (app) => {
        await registerOrderingRoutes(app, { checkout, admin, queries, guards: d.guards, guestCartId: d.guestCartId });
      },
    },
    onStart: async () => {
      const every = d.expiryIntervalMs ?? 30_000;
      if (every <= 0) return;
      timer = setInterval(() => {
        admin
          .expirePending()
          .then((n) => n && d.logger.info({ event: 'ordering.reservations_expired', count: n }, 'Reservas vencidas liberadas'))
          .catch((err: unknown) => d.logger.error({ err }, 'Falló la expiración de reservas'));
      }, every);
      timer.unref();
    },
    stop: () => clearInterval(timer),
  };
  return { context, checkout, admin, queries };
}
