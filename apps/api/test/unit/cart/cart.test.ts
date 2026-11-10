import { describe, expect, it } from 'vitest';
import { Cart, type AvailableVariant } from '../../../src/modules/cart/domain/cart.js';
import { buildCartView, type VariantInfo } from '../../../src/modules/cart/application/cart-view.js';

const now = new Date('2026-11-10T12:00:00Z');
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const variant = (over: Partial<AvailableVariant> = {}): AvailableVariant => ({
  variantId: 'v1',
  productId: 'p1',
  priceCents: 10_000,
  published: true,
  available: 5,
  ...over,
});

const newCart = (customerId: string | null = null) => Cart.create({ id: id(), customerId, now });

describe('Cart', () => {
  it('agrega una línea y suma cantidades de la misma variante', () => {
    const cart = newCart();
    cart.addItem(variant(), 1, id(), now);
    cart.addItem(variant(), 2, id(), now);
    expect(cart.toSnapshot().lines).toEqual([expect.objectContaining({ variantId: 'v1', quantity: 3, unitPriceCents: 10_000 })]);
    expect(cart.pullEvents().map((e) => e.type)).toEqual(['cart.CartCreated', 'cart.CartItemAdded', 'cart.CartItemAdded']);
  });

  it('valida publicado, stock acumulado y límites por línea y por carrito', () => {
    const cart = newCart();
    expect(() => cart.addItem(variant({ published: false }), 1, id(), now)).toThrow(expect.objectContaining({ code: 'PRODUCT_UNAVAILABLE' }));
    cart.addItem(variant({ available: 3 }), 2, id(), now);
    expect(() => cart.addItem(variant({ available: 3 }), 2, id(), now)).toThrow(expect.objectContaining({ code: 'INSUFFICIENT_STOCK', meta: { available: 3 } }));
    const big = newCart();
    big.addItem(variant({ available: 50 }), 10, id(), now);
    expect(() => big.addItem(variant({ available: 50 }), 1, id(), now)).toThrow(expect.objectContaining({ code: 'LINE_LIMIT' }));
    const full = newCart();
    for (let i = 0; i < 50; i += 1) full.addItem(variant({ variantId: `v${i}` }), 1, id(), now);
    expect(() => full.addItem(variant({ variantId: 'extra' }), 1, id(), now)).toThrow(expect.objectContaining({ code: 'CART_FULL' }));
  });

  it('cambia cantidad, quita líneas y vacía', () => {
    const cart = newCart();
    const lineId = id();
    cart.addItem(variant(), 1, lineId, now);
    cart.changeQuantity(lineId, 4, variant(), now);
    expect(cart.toSnapshot().lines[0]!.quantity).toBe(4);
    expect(() => cart.changeQuantity(lineId, 6, variant(), now)).toThrow(expect.objectContaining({ code: 'INSUFFICIENT_STOCK' }));
    expect(() => cart.changeQuantity('nope', 1, variant(), now)).toThrow(expect.objectContaining({ code: 'LINE_NOT_FOUND' }));
    cart.removeLine(lineId, now);
    expect(cart.toSnapshot().lines).toEqual([]);
    cart.addItem(variant(), 1, id(), now);
    cart.clear(now);
    expect(cart.isEmpty).toBe(true);
  });

  it('merge suma cantidades respetando stock y el máximo por línea; ignora lo no disponible', () => {
    const mine = newCart('c1');
    mine.addItem(variant({ variantId: 'a', available: 20 }), 8, id(), now);
    const guest = newCart();
    guest.addItem(variant({ variantId: 'a', available: 20 }), 5, id(), now);
    guest.addItem(variant({ variantId: 'b', available: 2 }), 2, id(), now);
    guest.addItem(variant({ variantId: 'c' }), 1, id(), now);
    const availability = new Map([
      ['a', variant({ variantId: 'a', available: 20 })],
      ['b', variant({ variantId: 'b', available: 1 })],
      ['c', variant({ variantId: 'c', published: false })],
    ]);
    mine.mergeFrom(guest, availability, () => id(), now);
    const lines = Object.fromEntries(mine.toSnapshot().lines.map((l) => [l.variantId, l.quantity]));
    expect(lines).toEqual({ a: 10, b: 1 });
  });
});

describe('buildCartView', () => {
  const info = (over: Partial<VariantInfo> = {}): VariantInfo => ({
    variantId: 'v1',
    productSlug: 'boot',
    title: 'Boot',
    color: 'Black',
    size: 'M',
    priceCents: 10_000,
    published: true,
    available: 5,
    image: null,
    ...over,
  });
  const line = (over = {}) => ({ id: 'l1', variantId: 'v1', productId: 'p1', quantity: 2, unitPriceCents: 10_000, ...over });

  it('calcula totales con el precio vigente y avisa cambios de precio', () => {
    const view = buildCartView('c', [line()], new Map([['v1', info({ priceCents: 12_000 })]]));
    expect(view).toMatchObject({ itemCount: 2, subtotalCents: 24_000 });
    expect(view.lines[0]).toMatchObject({ unitPriceCents: 12_000, previousUnitPriceCents: 10_000, warnings: ['PRICE_CHANGED'], maxQuantity: 5 });
  });

  it('las líneas agotadas o despublicadas no suman y llevan aviso; si hay menos stock, avisa reducción', () => {
    const view = buildCartView(
      'c',
      [line(), line({ id: 'l2', variantId: 'v2', quantity: 4 }), line({ id: 'l3', variantId: 'v3' })],
      new Map([
        ['v1', info({ available: 0 })],
        ['v2', info({ variantId: 'v2', available: 3 })],
        ['v3', info({ variantId: 'v3', published: false })],
      ]),
    );
    expect(view.lines.map((l) => [l.available, l.warnings])).toEqual([
      [false, ['OUT_OF_STOCK']],
      [true, ['QUANTITY_REDUCED']],
      [false, ['UNAVAILABLE']],
    ]);
    expect(view.subtotalCents).toBe(30_000);
    expect(view.itemCount).toBe(3);
  });
});
