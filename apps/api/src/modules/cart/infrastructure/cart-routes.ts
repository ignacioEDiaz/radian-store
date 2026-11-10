import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { addCartItemRequestSchema, updateCartLineRequestSchema } from '@radian/contracts';
import type { AuthGuards } from '../../../shared/infrastructure/http/auth.js';
import { parseBody, parseParams } from '../../../shared/infrastructure/http/validation.js';
import type { Metrics } from '../../../shared/infrastructure/observability/metrics.js';
import type { CartResult, CartService } from '../application/cart-service.js';
import type { CartOwner } from '../application/ports.js';

export const CART_COOKIE = 'rs_cart';
const UUID = /^[0-9a-f-]{36}$/i;
const lineParams = z.object({ lineId: z.uuid() });

/** Lee la cookie firmada del carrito de visitante (adulterada o inválida → null). */
export function guestCartId(req: FastifyRequest): string | null {
  const raw = req.cookies[CART_COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  return unsigned.valid && unsigned.value && UUID.test(unsigned.value) ? unsigned.value : null;
}

export function clearGuestCookie(reply: FastifyReply, secure: boolean) {
  reply.clearCookie(CART_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure, signed: true });
}

const ownerOf = (req: FastifyRequest): CartOwner => (req.auth ? { customerId: req.auth.customerId } : { guestCartId: guestCartId(req) });

export function registerCartRoutes(app: FastifyInstance, d: { cart: CartService; guards: AuthGuards; metrics: Metrics; secureCookie: boolean }) {
  return app.register(async (s) => {
    s.addHook('preHandler', d.guards.optionalAuth);

    /** Ejecuta el comando, emite la cookie de visitante si nació un carrito y mide el resultado. */
    const run = async (op: string, req: FastifyRequest, reply: FastifyReply, fn: (owner: CartOwner) => Promise<CartResult>) => {
      try {
        const owner = ownerOf(req);
        const result = await fn(owner);
        if (!req.auth && (!('guestCartId' in owner) || owner.guestCartId !== result.cartId)) {
          reply.setCookie(CART_COOKIE, result.cartId, { path: '/', httpOnly: true, sameSite: 'lax', secure: d.secureCookie, signed: true, maxAge: 30 * 86_400 });
        }
        d.metrics.cartOperations.inc({ op, result: 'ok' });
        return result.cart;
      } catch (err) {
        d.metrics.cartOperations.inc({ op, result: (err as { code?: string }).code ?? 'error' });
        throw err;
      }
    };

    s.get('/api/cart', async (req, reply) => {
      reply.header('cache-control', 'no-store');
      return d.cart.getCart(ownerOf(req));
    });

    s.post('/api/cart/items', async (req, reply) => {
      const body = parseBody(addCartItemRequestSchema, req.body);
      return run('add', req, reply, (owner) => d.cart.addItem(owner, body.variantId, body.quantity));
    });

    s.patch('/api/cart/items/:lineId', async (req, reply) => {
      const { lineId } = parseParams(lineParams, req.params);
      const { quantity } = parseBody(updateCartLineRequestSchema, req.body);
      return run('change', req, reply, (owner) => d.cart.changeQuantity(owner, lineId, quantity));
    });

    s.delete('/api/cart/items/:lineId', async (req, reply) => {
      const { lineId } = parseParams(lineParams, req.params);
      return run('remove', req, reply, (owner) => d.cart.removeLine(owner, lineId));
    });
  });
}
