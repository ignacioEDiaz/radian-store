import { describe, expect, it } from 'vitest';
import { calculateTotals, SHIPPING } from '../../../src/modules/ordering/domain/pricing.js';
import { DiscountCode } from '../../../src/modules/ordering/domain/discount-code.js';
import { Order } from '../../../src/modules/ordering/domain/order.js';

const now = new Date('2026-11-10T12:00:00Z');
const later = (min: number) => new Date(now.getTime() + min * 60_000);

describe('calculateTotals', () => {
  it('envío estándar gratis desde US$ 150 (subtotal con descuento) y exprés con costo fijo', () => {
    expect(calculateTotals({ subtotalCents: 15_000, discountCents: 0, shippingMethod: 'standard' })).toMatchObject({ shippingCents: 0, totalCents: 15_000 });
    expect(calculateTotals({ subtotalCents: 14_999, discountCents: 0, shippingMethod: 'standard' })).toMatchObject({ shippingCents: SHIPPING.standard, totalCents: 15_999 });
    expect(calculateTotals({ subtotalCents: 16_000, discountCents: 2_000, shippingMethod: 'standard' })).toMatchObject({ shippingCents: SHIPPING.standard, totalCents: 15_000 });
    expect(calculateTotals({ subtotalCents: 50_000, discountCents: 0, shippingMethod: 'express' })).toMatchObject({ shippingCents: SHIPPING.express });
  });
});

describe('DiscountCode', () => {
  const welcome = DiscountCode.rehydrate({ id: 'd', code: 'WELCOME20', kind: 'percent', value: 20, startsAt: null, endsAt: null, minSubtotalCents: null, oncePerEmail: true, active: true });

  it('porcentaje redondeado hacia abajo al centavo', () => {
    expect(welcome.amountFor({ subtotalCents: 999, now, alreadyUsedByEmail: false })).toBe(199);
  });

  it('rechaza uso repetido, vencido, inactivo o por debajo del mínimo, con motivo', () => {
    expect(() => welcome.amountFor({ subtotalCents: 10_000, now, alreadyUsedByEmail: true })).toThrow(expect.objectContaining({ code: 'INVALID_DISCOUNT', meta: { reason: 'ALREADY_USED' } }));
    const expired = DiscountCode.rehydrate({ ...welcome.toSnapshot(), endsAt: new Date('2026-01-01') });
    expect(() => expired.amountFor({ subtotalCents: 10_000, now, alreadyUsedByEmail: false })).toThrow(expect.objectContaining({ meta: { reason: 'EXPIRED' } }));
    const min = DiscountCode.rehydrate({ ...welcome.toSnapshot(), minSubtotalCents: 20_000 });
    expect(() => min.amountFor({ subtotalCents: 10_000, now, alreadyUsedByEmail: false })).toThrow(expect.objectContaining({ meta: { reason: 'MIN_SUBTOTAL' } }));
  });

  it('un monto fijo nunca supera el subtotal', () => {
    const fixed = DiscountCode.rehydrate({ ...welcome.toSnapshot(), kind: 'fixed', value: 5_000, oncePerEmail: false });
    expect(fixed.amountFor({ subtotalCents: 3_000, now, alreadyUsedByEmail: false })).toBe(3_000);
  });
});

describe('Order', () => {
  const place = () =>
    Order.place({
      id: 'o1',
      number: 'RS-001001',
      customerId: 'c1',
      cartId: 'cart1',
      email: 'ana@example.com',
      lines: [{ variantId: 'v1', productId: 'p1', sku: 'A-1', title: 'Boot', color: 'Black', size: 'M', imageUrl: null, unitPriceCents: 10_000, quantity: 2 }],
      shippingAddress: { recipient: 'Ana', line1: 'Calle 1', city: 'CABA', region: 'CABA', postalCode: '1000', country: 'AR', phone: '1155555555' },
      shippingMethod: 'standard',
      discount: null,
      totals: { subtotalCents: 20_000, discountCents: 0, shippingCents: 0, totalCents: 20_000, currency: 'USD' },
      reservationExpiresAt: later(15),
      now,
    });

  it('se crea pendiente de pago con líneas inmutables y emite OrderPlaced', () => {
    const o = place();
    expect(o.toSnapshot()).toMatchObject({ status: 'pending_payment', number: 'RS-001001', lines: [{ lineTotalCents: 20_000 }] });
    expect(o.pullEvents().map((e) => e.type)).toEqual(['ordering.OrderPlaced']);
  });

  it('pagado → enviado; historial de estados', () => {
    const o = place();
    o.markPaid({ provider: 'fake', reference: 'ch_1', brand: 'visa', last4: '4242', amountCents: 20_000 }, now);
    o.ship('TRACK-1', 'admin', later(60));
    expect(o.toSnapshot()).toMatchObject({ status: 'shipped', trackingCode: 'TRACK-1', payment: { last4: '4242', status: 'captured' } });
    expect(o.toSnapshot().history.map((h) => h.status)).toEqual(['pending_payment', 'paid', 'shipped']);
  });

  it('transiciones inválidas se rechazan', () => {
    const o = place();
    expect(() => o.ship('X-1', 'admin', now)).toThrow(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
    o.markPaid({ provider: 'fake', reference: 'r', brand: 'visa', last4: '4242', amountCents: 20_000 }, now);
    o.ship('X-1', 'admin', now);
    expect(() => o.cancel({ reason: 'x', actor: 'admin', refundReference: 're_1' }, now)).toThrow(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
  });

  it('pago rechazado cancela; cancelar pagado exige reintegro', () => {
    const declined = place();
    declined.paymentFailed('card_declined', now);
    expect(declined.toSnapshot()).toMatchObject({ status: 'cancelled', cancelReason: 'payment_declined:card_declined' });
    const paid = place();
    paid.markPaid({ provider: 'fake', reference: 'r', brand: 'visa', last4: '4242', amountCents: 20_000 }, now);
    expect(() => paid.cancel({ reason: 'cliente', actor: 'admin', refundReference: null }, now)).toThrow(expect.objectContaining({ code: 'REFUND_REQUIRED' }));
    paid.cancel({ reason: 'cliente', actor: 'admin', refundReference: 're_9' }, now);
    expect(paid.toSnapshot()).toMatchObject({ status: 'cancelled', payment: { status: 'refunded' } });
  });

  it('una reserva vencida cancela solo si sigue pendiente', () => {
    const o = place();
    o.expireReservation(later(16));
    expect(o.toSnapshot()).toMatchObject({ status: 'cancelled', cancelReason: 'reservation_expired' });
  });
});

describe('regla de envío gratis publicada', () => {
  it('el umbral que muestra la tienda (contrato) es el que aplica el dominio', async () => {
    const { FREE_SHIPPING_THRESHOLD_CENTS } = await import('@radian/contracts');
    const { FREE_SHIPPING_THRESHOLD } = await import('../../../src/modules/ordering/domain/pricing.js');
    expect(FREE_SHIPPING_THRESHOLD_CENTS).toBe(FREE_SHIPPING_THRESHOLD);
  });
});
