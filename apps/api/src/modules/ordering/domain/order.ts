import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import { ConflictError, DomainError } from '../../../shared/domain/errors.js';
import type { ShippingMethod, Totals } from './pricing.js';

export type OrderStatus = 'pending_payment' | 'paid' | 'shipped' | 'cancelled';

export interface OrderAddress {
  recipient: string;
  line1: string;
  line2?: string | undefined;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
}

/** Foto inmutable de lo comprado: no cambia aunque luego cambie el catálogo. */
export interface OrderLine {
  variantId: string;
  productId: string;
  sku: string;
  title: string;
  color: string;
  size: string;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface Payment {
  provider: string;
  reference: string;
  brand: string;
  last4: string;
  amountCents: number;
  status: 'captured' | 'refunded';
  refundReference?: string;
}

export interface OrderSnapshot {
  id: string;
  number: string;
  customerId: string | null;
  cartId: string | null;
  email: string;
  lines: OrderLine[];
  shippingAddress: OrderAddress;
  shippingMethod: ShippingMethod;
  discount: { code: string; amountCents: number } | null;
  totals: Totals;
  status: OrderStatus;
  payment: Payment | null;
  trackingCode: string | null;
  cancelReason: string | null;
  reservationExpiresAt: Date;
  history: { status: OrderStatus; at: Date; actor: string }[];
  placedAt: Date;
  updatedAt: Date;
  version: number;
}

type E<T extends string> = DomainEvent<T, { snapshot: OrderSnapshot }>;
export type OrderEvent = E<'ordering.OrderPlaced'> | E<'ordering.OrderPaid'> | E<'ordering.OrderPaymentFailed'> | E<'ordering.OrderShipped'> | E<'ordering.OrderCancelled'>;
export const ORDER_EVENT_TYPES: OrderEvent['type'][] = [
  'ordering.OrderPlaced',
  'ordering.OrderPaid',
  'ordering.OrderPaymentFailed',
  'ordering.OrderShipped',
  'ordering.OrderCancelled',
];

/** Pedido (agregado de ordering) con su máquina de estados. */
export class Order extends AggregateRoot<OrderEvent> {
  readonly aggregateType = 'Order';

  private constructor(version: number, private s: Omit<OrderSnapshot, 'version'>) {
    super(s.id, version);
  }

  static place(input: {
    id: string;
    number: string;
    customerId: string | null;
    cartId: string | null;
    email: string;
    lines: Omit<OrderLine, 'lineTotalCents'>[];
    shippingAddress: OrderAddress;
    shippingMethod: ShippingMethod;
    discount: { code: string; amountCents: number } | null;
    totals: Totals;
    reservationExpiresAt: Date;
    now: Date;
  }): Order {
    if (input.lines.length === 0) throw new DomainError('EMPTY_CART', 'El carrito está vacío');
    const { now, lines, ...rest } = input;
    const order = new Order(0, {
      ...rest,
      lines: lines.map((l) => ({ ...l, lineTotalCents: l.unitPriceCents * l.quantity })),
      status: 'pending_payment',
      payment: null,
      trackingCode: null,
      cancelReason: null,
      history: [{ status: 'pending_payment', at: now, actor: input.customerId ?? input.email }],
      placedAt: now,
      updatedAt: now,
    });
    order.emit('ordering.OrderPlaced', now);
    return order;
  }

  static rehydrate(snapshot: OrderSnapshot): Order {
    const { version, ...state } = snapshot;
    return new Order(version, structuredClone(state));
  }

  get status() {
    return this.s.status;
  }
  get number() {
    return this.s.number;
  }
  get payment() {
    return this.s.payment;
  }

  assertVersion(expected: number) {
    if (expected !== this.version) throw new ConflictError('VERSION_CONFLICT', 'El pedido fue modificado; recargá para ver su estado', { currentVersion: this.version });
  }

  markPaid(payment: Omit<Payment, 'status'>, now: Date) {
    this.require(['pending_payment'], 'paid');
    this.s.payment = { ...payment, status: 'captured' };
    this.transition('paid', 'payment-provider', now, 'ordering.OrderPaid');
  }

  paymentFailed(reason: string, now: Date) {
    this.require(['pending_payment'], 'cancelled');
    this.s.cancelReason = `payment_declined:${reason}`;
    this.transition('cancelled', 'payment-provider', now, 'ordering.OrderPaymentFailed');
  }

  expireReservation(now: Date) {
    if (this.s.status !== 'pending_payment') return;
    this.s.cancelReason = 'reservation_expired';
    this.transition('cancelled', 'system', now, 'ordering.OrderCancelled');
  }

  ship(trackingCode: string, actor: string, now: Date) {
    this.require(['paid'], 'shipped');
    this.s.trackingCode = trackingCode.trim();
    this.transition('shipped', actor, now, 'ordering.OrderShipped');
  }

  /** Cancelación administrativa: si estaba pagado exige el reintegro ya hecho. */
  cancel(input: { reason: string; actor: string; refundReference: string | null }, now: Date) {
    this.require(['pending_payment', 'paid'], 'cancelled');
    if (this.s.status === 'paid') {
      if (!input.refundReference) throw new DomainError('REFUND_REQUIRED', 'Para cancelar un pedido pagado hay que reintegrar el pago');
      this.s.payment = { ...this.s.payment!, status: 'refunded', refundReference: input.refundReference };
    }
    this.s.cancelReason = input.reason;
    this.transition('cancelled', input.actor, now, 'ordering.OrderCancelled');
  }

  toSnapshot(): OrderSnapshot {
    return { ...structuredClone(this.s), version: this.version };
  }

  private require(from: OrderStatus[], to: OrderStatus) {
    if (!from.includes(this.s.status)) {
      throw new DomainError('INVALID_TRANSITION', `No se puede pasar de ${this.s.status} a ${to}`, { from: this.s.status, to });
    }
  }

  private transition(status: OrderStatus, actor: string, now: Date, event: OrderEvent['type']) {
    this.s.status = status;
    this.s.updatedAt = now;
    this.s.history = [...this.s.history, { status, at: now, actor }];
    this.emit(event, now);
  }

  private emit(type: OrderEvent['type'], now: Date) {
    this.record(type, { snapshot: { ...this.toSnapshot(), version: this.version + 1 } }, now);
  }
}
