import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { adminOrdersQuerySchema, cancelOrderRequestSchema, checkoutQuoteRequestSchema, placeOrderRequestSchema, shipOrderRequestSchema } from '@radian/contracts';
import { ValidationError } from '../../../shared/domain/errors.js';
import type { AuthGuards } from '../../../shared/infrastructure/http/auth.js';
import { parseBody, parseParams, parseQuery } from '../../../shared/infrastructure/http/validation.js';
import type { CheckoutService, OrderAdmin } from '../application/checkout-service.js';
import type { OrderQueries } from './read-side.js';

const numberParams = z.object({ number: z.string().regex(/^RS-\d{6,}$/) });
const pageQuery = z.object({ page: z.coerce.number().int().min(1).default(1) });

export interface OrderingRouteDeps {
  checkout: CheckoutService;
  admin: OrderAdmin;
  queries: OrderQueries;
  guards: AuthGuards;
  /** Id del carrito de visitante (cookie firmada del contexto cart). */
  guestCartId: (req: FastifyRequest) => string | null;
}

export function registerOrderingRoutes(app: FastifyInstance, d: OrderingRouteDeps) {
  const buyer = (req: FastifyRequest) => ({ customerId: req.auth?.customerId ?? null, guestCartId: req.auth ? null : d.guestCartId(req) });

  return app.register(async (s) => {
    s.post('/api/checkout/quote', { preHandler: d.guards.optionalAuth }, async (req) => {
      const body = parseBody(checkoutQuoteRequestSchema, req.body ?? {});
      return d.checkout.quote({ ...buyer(req), ...body });
    });

    s.post('/api/checkout/orders', { preHandler: d.guards.optionalAuth }, async (req, reply) => {
      const key = req.headers['idempotency-key'];
      if (typeof key !== 'string' || !/^[\w-]{8,100}$/.test(key)) {
        throw new ValidationError([{ path: 'Idempotency-Key', message: 'Falta el header Idempotency-Key' }]);
      }
      const body = parseBody(placeOrderRequestSchema, req.body);
      const { httpStatus, order } = await d.checkout.placeOrder({ ...buyer(req), ...body, idempotencyKey: key });
      if (httpStatus === 402) {
        return reply.status(402).type('application/problem+json').send({
          type: 'https://radian.store/problems/payment-declined',
          title: 'Pago rechazado',
          status: 402,
          code: 'PAYMENT_DECLINED',
          detail: 'El pago fue rechazado. Probá con otra tarjeta.',
          requestId: String(req.id),
          meta: { reason: order.cancelReason?.replace('payment_declined:', '') ?? 'declined', order },
        });
      }
      return reply.status(httpStatus).send(order);
    });

    s.get('/api/orders', { preHandler: d.guards.requireAuth }, async (req) => d.queries.listMine(req.auth!.customerId, parseQuery(pageQuery, req.query).page));
    s.get('/api/orders/:number', { preHandler: d.guards.requireAuth }, async (req) => d.queries.getMine(req.auth!.customerId, parseParams(numberParams, req.params).number));

    s.get('/api/admin/orders', { preHandler: d.guards.requireRole('admin') }, async (req) => {
      const q = parseQuery(adminOrdersQuerySchema, req.query);
      return d.queries.listAdmin(q.status, q.page);
    });
    s.get('/api/admin/orders/:number', { preHandler: d.guards.requireRole('admin') }, async (req) => d.queries.getAdmin(parseParams(numberParams, req.params).number));
    s.post('/api/admin/orders/:number/ship', { preHandler: d.guards.requireRole('admin') }, async (req) => {
      const body = parseBody(shipOrderRequestSchema, req.body);
      return d.admin.ship({ number: parseParams(numberParams, req.params).number, ...body, actor: req.auth!.customerId });
    });
    s.post('/api/admin/orders/:number/cancel', { preHandler: d.guards.requireRole('admin') }, async (req) => {
      const body = parseBody(cancelOrderRequestSchema, req.body);
      return d.admin.cancel({ number: parseParams(numberParams, req.params).number, ...body, actor: req.auth!.customerId });
    });
  });
}
