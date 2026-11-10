import type { OrderDetail, OrderSummary } from '@radian/contracts';
import type { OrderSnapshot } from '../domain/order.js';

const iso = (d: Date | string) => new Date(d).toISOString();

export function toOrderDetail(s: OrderSnapshot): OrderDetail {
  return {
    id: s.id,
    number: s.number,
    status: s.status,
    email: s.email,
    lines: s.lines.map(({ productId: _p, ...l }) => l),
    shippingAddress: s.shippingAddress,
    shippingMethod: s.shippingMethod,
    discount: s.discount,
    totals: s.totals,
    payment: s.payment ? { brand: s.payment.brand, last4: s.payment.last4, status: s.payment.status } : null,
    trackingCode: s.trackingCode,
    cancelReason: s.cancelReason,
    history: s.history.map((h) => ({ status: h.status, at: iso(h.at) })),
    placedAt: iso(s.placedAt),
    version: s.version,
  };
}

export function toOrderSummary(s: OrderSnapshot): OrderSummary {
  return {
    id: s.id,
    number: s.number,
    status: s.status,
    email: s.email,
    totalCents: s.totals.totalCents,
    itemCount: s.lines.reduce((n, l) => n + l.quantity, 0),
    placedAt: iso(s.placedAt),
  };
}
