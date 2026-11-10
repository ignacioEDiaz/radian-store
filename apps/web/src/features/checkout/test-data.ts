import type { CheckoutQuote, OrderDetail } from '@radian/contracts';

export function quote(over: Partial<CheckoutQuote> = {}): CheckoutQuote {
  return {
    lines: [
      {
        lineId: 'v1',
        variantId: 'v1',
        productSlug: '',
        title: 'Sharp Leather Boot',
        color: 'Black',
        size: 'M',
        image: null,
        quantity: 1,
        unitPriceCents: 45_000,
        previousUnitPriceCents: null,
        lineTotalCents: 45_000,
        available: true,
        maxQuantity: 5,
        warnings: [],
      },
    ],
    shippingOptions: [
      { method: 'standard', label: 'Estándar (3 a 7 días hábiles)', priceCents: 0 },
      { method: 'express', label: 'Exprés (1 a 2 días hábiles)', priceCents: 2_500 },
    ],
    discount: null,
    discountError: null,
    totals: { subtotalCents: 45_000, discountCents: 0, shippingCents: 0, totalCents: 45_000, currency: 'USD' },
    ...over,
  };
}

export function order(over: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'o1',
    number: 'RS-001001',
    status: 'paid',
    email: 'ana@example.com',
    lines: [{ variantId: 'v1', sku: 'SB-1', title: 'Sharp Leather Boot', color: 'Black', size: 'M', imageUrl: null, unitPriceCents: 45_000, quantity: 1, lineTotalCents: 45_000 }],
    shippingAddress: { recipient: 'Ana Pérez', line1: 'Av. Corrientes 1234', city: 'CABA', region: 'CABA', postalCode: '1043', country: 'AR', phone: '1155555555' },
    shippingMethod: 'standard',
    discount: null,
    totals: { subtotalCents: 45_000, discountCents: 0, shippingCents: 0, totalCents: 45_000, currency: 'USD' },
    payment: { brand: 'visa', last4: '4242', status: 'captured' },
    trackingCode: null,
    cancelReason: null,
    history: [
      { status: 'pending_payment', at: '2026-11-10T12:00:00.000Z' },
      { status: 'paid', at: '2026-11-10T12:00:01.000Z' },
    ],
    placedAt: '2026-11-10T12:00:00.000Z',
    version: 2,
    ...over,
  };
}
