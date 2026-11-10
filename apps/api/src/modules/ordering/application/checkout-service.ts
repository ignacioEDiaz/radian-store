import { createHash } from 'node:crypto';
import type { CartLineView, CheckoutQuote, OrderDetail } from '@radian/contracts';
import type { Clock, IdGenerator } from '../../../shared/application/ports.js';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.js';
import { ConflictError, DomainError, NotFoundError } from '../../../shared/domain/errors.js';
import { Order, type OrderAddress } from '../domain/order.js';
import { SHIPPING_LABELS, calculateTotals, type ShippingMethod, type Totals } from '../domain/pricing.js';
import type { Card, CheckoutPorts, IdempotencyStore, PaymentGateway, PricedVariant } from './ports.js';
import { toOrderDetail } from './views.js';

export const RESERVATION_MINUTES = 15;

export interface Buyer {
  customerId: string | null;
  guestCartId: string | null;
}

export interface PlaceOrderInput extends Buyer {
  idempotencyKey: string;
  email: string;
  shippingAddress: OrderAddress;
  shippingMethod: ShippingMethod;
  discountCode?: string | undefined;
  card: Card;
  expectedTotalCents: number;
}

export interface PlaceOrderResult {
  httpStatus: 201 | 202 | 402;
  order: OrderDetail;
}

interface Metrics {
  ordersPlaced: { inc(labels: { result: string }): void };
  paymentAttempts: { inc(labels: { result: string }): void };
}

/**
 * Checkout como saga corta:
 *  1) transacción: precios vigentes + descuento + reserva atómica de stock + pedido pendiente
 *  2) cobro FUERA de la transacción (no retiene conexiones ni locks durante la llamada externa)
 *  3) transacción: pagado (commit de la reserva) o cancelado (liberación)
 * Idempotente por clave: un reintento con la misma clave devuelve la misma respuesta.
 */
export class CheckoutService {
  constructor(
    private readonly d: {
      uow: UnitOfWork<CheckoutPorts>;
      idempotency: IdempotencyStore;
      payments: PaymentGateway;
      clock: Clock;
      ids: IdGenerator;
      metrics: Metrics;
    },
  ) {}

  quote(input: Buyer & { shippingMethod: ShippingMethod; discountCode?: string | undefined; email?: string | undefined }): Promise<CheckoutQuote> {
    return this.d.uow.run(async (p) => {
      const { lines, subtotalCents } = await this.priceCart(p, input, false);
      let discount: CheckoutQuote['discount'] = null;
      let discountError: string | null = null;
      if (input.discountCode) {
        try {
          discount = await this.applyDiscount(p, input.discountCode, subtotalCents, input.email ?? null);
        } catch (err) {
          if (!(err instanceof DomainError)) throw err;
          discountError = err.message;
        }
      }
      const totals = calculateTotals({ subtotalCents, discountCents: discount?.amountCents ?? 0, shippingMethod: input.shippingMethod });
      return {
        lines: lines.map((l) => l.view),
        shippingOptions: (['standard', 'express'] as const).map((method) => ({
          method,
          label: SHIPPING_LABELS[method],
          priceCents: calculateTotals({ subtotalCents, discountCents: discount?.amountCents ?? 0, shippingMethod: method }).shippingCents,
        })),
        discount,
        discountError,
        totals,
      };
    });
  }

  async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const scope = input.customerId ?? `guest:${input.email.toLowerCase()}`;
    const { card, idempotencyKey: _k, ...rest } = input;
    const requestHash = createHash('sha256').update(JSON.stringify({ ...rest, card: card.number.slice(-4) })).digest('hex');

    const idem = await this.d.idempotency.begin(scope, input.idempotencyKey, requestHash);
    if (idem.state === 'completed') return { httpStatus: idem.httpStatus as PlaceOrderResult['httpStatus'], order: idem.response as OrderDetail };
    if (idem.state === 'processing') throw new ConflictError('REQUEST_IN_PROGRESS', 'Tu pedido se está procesando; esperá unos segundos');
    if (idem.state === 'mismatch') throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'La clave de idempotencia ya se usó con otros datos');

    let order: Order;
    try {
      order = await this.d.uow.run((p) => this.createPendingOrder(p, input));
    } catch (err) {
      await this.d.idempotency.abandon(scope, input.idempotencyKey);
      this.d.metrics.ordersPlaced.inc({ result: (err as { code?: string }).code ?? 'error' });
      throw err;
    }

    let result: PlaceOrderResult;
    try {
      const charge = await this.d.payments.charge({ amountCents: order.toSnapshot().totals.totalCents, card, reference: order.number });
      this.d.metrics.paymentAttempts.inc({ result: charge.status });
      result = await this.d.uow.run(async (p) => {
        const current = (await p.orders.findById(order.id))!;
        const now = this.d.clock.now();
        if (charge.status === 'approved') {
          current.markPaid({ provider: 'fake', reference: charge.reference, brand: charge.brand, last4: charge.last4, amountCents: current.toSnapshot().totals.totalCents }, now);
          await p.commit(current.id);
          const discount = current.toSnapshot().discount;
          if (discount) {
            const code = await p.discounts.findByCode(discount.code);
            if (code) await p.discounts.redeem(code.id, input.email.toLowerCase(), current.id, now);
          }
          await p.orders.save(current);
          return { httpStatus: 201, order: toOrderDetail(current.toSnapshot()) };
        }
        if (charge.status === 'declined') {
          current.paymentFailed(charge.reason, now);
          await p.release(current.id);
          await p.orders.save(current);
          return { httpStatus: 402, order: toOrderDetail(current.toSnapshot()) };
        }
        // timeout: queda pendiente con la reserva activa; el job de expiración resuelve.
        return { httpStatus: 202, order: toOrderDetail(current.toSnapshot()) };
      });
    } catch (err) {
      // El pedido existe: nunca dejar la clave en "processing" para siempre.
      result = { httpStatus: 202, order: toOrderDetail(order.toSnapshot()) };
      await this.d.idempotency.complete(scope, input.idempotencyKey, result.httpStatus, result.order);
      throw err;
    }
    this.d.metrics.ordersPlaced.inc({ result: result.order.status });
    await this.d.idempotency.complete(scope, input.idempotencyKey, result.httpStatus, result.order);
    return result;
  }

  private async createPendingOrder(p: CheckoutPorts, input: PlaceOrderInput): Promise<Order> {
    const { lines, subtotalCents, cartId } = await this.priceCart(p, input, true);
    const discount = input.discountCode ? await this.applyDiscount(p, input.discountCode, subtotalCents, input.email) : null;
    const totals: Totals = calculateTotals({ subtotalCents, discountCents: discount?.amountCents ?? 0, shippingMethod: input.shippingMethod });
    if (totals.totalCents !== input.expectedTotalCents) {
      throw new ConflictError('PRICE_CHANGED', 'El total cambió desde que lo viste. Revisá el resumen antes de pagar.', { totals });
    }
    const now = this.d.clock.now();
    const orderId = this.d.ids.uuid();
    const expiresAt = new Date(now.getTime() + RESERVATION_MINUTES * 60_000);
    await p.reserve(orderId, lines.map((l) => ({ variantId: l.priced.variantId, quantity: l.quantity })), expiresAt);
    const order = Order.place({
      id: orderId,
      number: await p.nextOrderNumber(),
      customerId: input.customerId,
      cartId,
      email: input.email.toLowerCase(),
      lines: lines.map(({ priced: v, quantity }) => ({
        variantId: v.variantId,
        productId: v.productId,
        sku: v.sku,
        title: v.title,
        color: v.color,
        size: v.size,
        imageUrl: v.imageUrl,
        unitPriceCents: v.priceCents,
        quantity,
      })),
      shippingAddress: input.shippingAddress,
      shippingMethod: input.shippingMethod,
      discount,
      totals,
      reservationExpiresAt: expiresAt,
      now,
    });
    await p.orders.save(order);
    return order;
  }

  private async priceCart(p: CheckoutPorts, buyer: Buyer, strict: boolean) {
    const cart = await p.cart({ customerId: buyer.customerId, cartId: buyer.guestCartId });
    if (!cart || cart.lines.length === 0) throw new DomainError('EMPTY_CART', 'Tu carrito está vacío');
    const priced = await p.pricing(cart.lines.map((l) => l.variantId));
    const lines: { priced: PricedVariant; quantity: number; view: CartLineView }[] = [];
    for (const l of cart.lines) {
      const v = priced.get(l.variantId);
      if (!v || !v.published) {
        if (strict) throw new DomainError('PRODUCT_UNAVAILABLE', `${v?.title ?? 'Un producto'} ya no está disponible. Quitalo del carrito para continuar.`);
        continue;
      }
      const available = v.available > 0;
      lines.push({
        priced: v,
        quantity: l.quantity,
        view: {
          lineId: l.variantId,
          variantId: v.variantId,
          productSlug: '',
          title: v.title,
          color: v.color,
          size: v.size,
          image: null,
          quantity: l.quantity,
          unitPriceCents: v.priceCents,
          previousUnitPriceCents: null,
          lineTotalCents: v.priceCents * l.quantity,
          available,
          maxQuantity: v.available,
          warnings: !available ? ['OUT_OF_STOCK'] : v.available < l.quantity ? ['QUANTITY_REDUCED'] : [],
        },
      });
    }
    return { lines, subtotalCents: lines.reduce((n, l) => n + l.priced.priceCents * l.quantity, 0), cartId: cart.cartId };
  }

  private async applyDiscount(p: CheckoutPorts, rawCode: string, subtotalCents: number, email: string | null) {
    const code = await p.discounts.findByCode(rawCode.trim().toUpperCase());
    if (!code) throw new DomainError('INVALID_DISCOUNT', 'El código no existe', { reason: 'NOT_FOUND' });
    const alreadyUsedByEmail = email !== null && code.oncePerEmail ? await p.discounts.usedBy(code.id, email.toLowerCase()) : false;
    const amountCents = code.amountFor({ subtotalCents, now: this.d.clock.now(), alreadyUsedByEmail });
    return { code: code.code, amountCents };
  }
}

/** Administración de pedidos y vencimiento de reservas. */
export class OrderAdmin {
  constructor(private readonly d: { uow: UnitOfWork<CheckoutPorts>; payments: PaymentGateway; clock: Clock }) {}

  ship(input: { number: string; expectedVersion: number; trackingCode: string; actor: string }): Promise<OrderDetail> {
    return this.d.uow.run(async (p) => {
      const order = await this.load(p, input.number);
      order.assertVersion(input.expectedVersion);
      order.ship(input.trackingCode, input.actor, this.d.clock.now());
      await p.orders.save(order);
      return toOrderDetail(order.toSnapshot());
    });
  }

  async cancel(input: { number: string; expectedVersion: number; reason: string; actor: string }): Promise<OrderDetail> {
    const snapshot = await this.d.uow.run(async (p) => {
      const order = await this.load(p, input.number);
      order.assertVersion(input.expectedVersion);
      return order.toSnapshot();
    });
    // El reintegro (externo) se pide antes de cambiar el estado; si falla, el pedido sigue pagado.
    const refund = snapshot.status === 'paid' && snapshot.payment ? await this.d.payments.refund({ reference: snapshot.payment.reference, amountCents: snapshot.totals.totalCents }) : null;
    return this.d.uow.run(async (p) => {
      const order = await this.load(p, input.number);
      order.assertVersion(input.expectedVersion);
      const wasPaid = order.status === 'paid';
      order.cancel({ reason: input.reason, actor: input.actor, refundReference: refund?.reference ?? null }, this.d.clock.now());
      if (wasPaid) await p.restock(order.id);
      else await p.release(order.id);
      await p.orders.save(order);
      return toOrderDetail(order.toSnapshot());
    });
  }

  /** Cancela pedidos con la reserva vencida y libera su stock. */
  expirePending(): Promise<number> {
    return this.d.uow.run(async (p) => {
      const now = this.d.clock.now();
      const orders = await p.orders.expiredPending(now, 100);
      for (const order of orders) {
        order.expireReservation(now);
        await p.release(order.id);
        await p.orders.save(order);
      }
      return orders.length;
    });
  }

  private async load(p: CheckoutPorts, number: string) {
    const order = await p.orders.findByNumber(number);
    if (!order) throw new NotFoundError('ORDER_NOT_FOUND', 'El pedido no existe');
    return order;
  }
}
