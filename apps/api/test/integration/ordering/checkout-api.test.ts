import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CheckoutQuote, OrderDetail } from '@radian/contracts';
import { ORIGIN, client, fullApp, loginAdmin, resetAll, sessionCookie } from '../../support/full-app.js';
import { drain, seedCatalog } from '../../support/catalog-seed.js';
import { createOrderingModule } from '../../../src/modules/ordering/index.js';
import { Metrics } from '../../../src/shared/infrastructure/observability/metrics.js';
import { silentLogger } from '../../support/logger.js';
import type { AuthGuards } from '../../../src/shared/infrastructure/http/auth.js';

let ctx: Awaited<ReturnType<typeof fullApp>>;
let boot: string;
let last: string;

const ADDRESS = { recipient: 'Ana Pérez', line1: 'Av. Corrientes 1234', city: 'CABA', region: 'CABA', postalCode: '1043', country: 'AR', phone: '+54 11 5555 5555' };
const CARD = (number = '4242 4242 4242 4242') => ({ number, expMonth: 12, expYear: 2030, cvc: '123', holder: 'Ana Pérez' });

beforeAll(async () => {
  ctx = await fullApp();
});
afterAll(() => ctx.close());

beforeEach(async () => {
  await resetAll(ctx.infra);
  const { products } = await seedCatalog(ctx.infra, ctx.mediaDir, [
    { title: 'Sharp Leather Boot', price: 45_000, variants: [{ color: 'Black', size: 'M', stock: 10 }] },
    { title: 'Last One', price: 12_000, variants: [{ color: 'Black', size: 'L', stock: 1 }] },
  ]);
  boot = products[0]!.variants[0]!.id;
  last = products[1]!.variants[0]!.id;
  // El reset borró el admin; lo recreamos como lo haría el arranque.
  await ctx.app.inject({ method: 'POST', url: '/api/auth/register', headers: { 'content-type': 'application/json', origin: ORIGIN }, payload: { name: 'Admin', email: 'admin@radian.store', password: 'admin-password-123' } });
  await ctx.infra.writeDb.query(`UPDATE customers SET role = 'admin' WHERE email = 'admin@radian.store'`);
  await drain(ctx.infra);
  await ctx.infra.readDb.query(`UPDATE customer_profiles SET role = 'admin' WHERE email = 'admin@radian.store'`);
  await ctx.infra.redis.flushdb();
});

async function customer(email = 'ana@example.com') {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/register', headers: { 'content-type': 'application/json', origin: ORIGIN }, payload: { name: 'Ana', email, password: 'una-clave-larga' } });
  await drain(ctx.infra);
  return client(ctx.app, sessionCookie(res));
}

async function quote(api: ReturnType<typeof client>, body: Record<string, unknown> = {}) {
  const res = await api.post('/api/checkout/quote', { shippingMethod: 'standard', ...body });
  return res.json<CheckoutQuote>();
}

async function placeOrder(api: ReturnType<typeof client>, overrides: Record<string, unknown> = {}, key: string = crypto.randomUUID()) {
  const q = await quote(api, { discountCode: overrides['discountCode'], email: overrides['email'] ?? 'ana@example.com' });
  return api.post(
    '/api/checkout/orders',
    { email: 'ana@example.com', shippingAddress: ADDRESS, shippingMethod: 'standard', card: CARD(), expectedTotalCents: q.totals.totalCents, ...overrides },
    { 'idempotency-key': key },
  );
}

const stock = async (variantId: string) =>
  (await ctx.infra.writeDb.query<{ on_hand: number; reserved: number }>('SELECT on_hand, reserved FROM inventory_items WHERE variant_id = $1', [variantId])).rows[0]!;

describe('Checkout', () => {
  it('compra aprobada: pedido pagado, stock descontado, carrito vacío, historial y ranking de ventas', async () => {
    const api = await customer();
    await api.post('/api/cart/items', { variantId: boot, quantity: 2 });
    const q = await quote(api);
    expect(q.totals).toEqual({ subtotalCents: 90_000, discountCents: 0, shippingCents: 0, totalCents: 90_000, currency: 'USD' });

    const res = await placeOrder(api);
    expect(res.statusCode).toBe(201);
    const order = res.json<OrderDetail>();
    expect(order).toMatchObject({ status: 'paid', number: expect.stringMatching(/^RS-\d{6}$/), payment: { brand: 'visa', last4: '4242' } });
    expect(JSON.stringify(order)).not.toContain('4242424242424242');
    expect(await stock(boot)).toEqual({ on_hand: 8, reserved: 0 });

    await drain(ctx.infra);
    expect((await api.get('/api/cart')).json()).toMatchObject({ itemCount: 0 });
    const mine = (await api.get('/api/orders')).json();
    expect(mine.items).toEqual([expect.objectContaining({ number: order.number, status: 'paid', itemCount: 2 })]);
    expect((await api.get(`/api/orders/${order.number}`)).json()).toMatchObject({ number: order.number, lines: [{ quantity: 2 }] });
    const sales = await ctx.infra.readDb.query('SELECT sales_count FROM catalog_products WHERE title = $1', ['Sharp Leather Boot']);
    expect(sales.rows[0]!.sales_count).toBe(2);
  });

  it('tarjeta rechazada → 402, pedido cancelado, stock liberado y el carrito se conserva', async () => {
    const api = await customer();
    await api.post('/api/cart/items', { variantId: boot, quantity: 1 });
    const res = await placeOrder(api, { card: CARD('4000 0000 0000 0002') });
    expect(res.statusCode).toBe(402);
    expect(res.json()).toMatchObject({ code: 'PAYMENT_DECLINED', meta: { reason: 'card_declined', order: { status: 'cancelled' } } });
    expect(await stock(boot)).toEqual({ on_hand: 10, reserved: 0 });
    await drain(ctx.infra);
    expect((await api.get('/api/cart')).json()).toMatchObject({ itemCount: 1 });
  });

  it('idempotencia: doble envío con la misma clave → un solo pedido y la misma respuesta; otra carga con la misma clave → 422', async () => {
    const api = await customer();
    await api.post('/api/cart/items', { variantId: boot, quantity: 1 });
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([placeOrder(api, {}, key), placeOrder(api, {}, key)]);
    const statuses = [a.statusCode, b.statusCode].sort();
    expect(statuses[0]).toBe(201);
    expect([201, 409]).toContain(statuses[1]);
    const replay = await placeOrder(api, {}, key);
    expect(replay.statusCode).toBe(201);
    expect(replay.json().number).toBe((a.statusCode === 201 ? a : b).json().number);
    const { rows } = await ctx.infra.writeDb.query('SELECT count(*)::int AS n FROM orders');
    expect(rows[0]!.n).toBe(1);
    const reused = await api.post('/api/checkout/orders', { email: 'ana@example.com', shippingAddress: ADDRESS, shippingMethod: 'express', card: CARD(), expectedTotalCents: 1 }, { 'idempotency-key': key });
    expect(reused.json().code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('total distinto al visto → 409 PRICE_CHANGED con el nuevo desglose; falta de stock → 422 sin cobrar', async () => {
    const api = await customer();
    await api.post('/api/cart/items', { variantId: last, quantity: 1 });
    const stale = await placeOrder(api, { expectedTotalCents: 1 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'PRICE_CHANGED', meta: { totals: { totalCents: 13_000 } } });

    // otro comprador se lleva la última unidad
    const other = await customer('otro@example.com');
    await other.post('/api/cart/items', { variantId: last, quantity: 1 });
    expect((await placeOrder(other, { email: 'otro@example.com' })).statusCode).toBe(201);
    const out = await placeOrder(api);
    expect(out.statusCode).toBe(422);
    expect(out.json()).toMatchObject({ code: 'INSUFFICIENT_STOCK', meta: { lines: [{ variantId: last, available: 0 }] } });
    expect((await ctx.infra.writeDb.query(`SELECT count(*)::int AS n FROM orders WHERE email = 'ana@example.com'`)).rows[0]!.n).toBe(0);
  });

  it('WELCOME20 descuenta 20 % una sola vez por email; el envío se recalcula con el descuento', async () => {
    const api = await customer();
    await api.post('/api/cart/items', { variantId: last, quantity: 1 });
    const q = await quote(api, { discountCode: 'welcome20', email: 'ana@example.com' });
    expect(q.discount).toEqual({ code: 'WELCOME20', amountCents: 2_400 });
    expect(q.totals).toMatchObject({ subtotalCents: 12_000, discountCents: 2_400, shippingCents: 1_000, totalCents: 10_600 });
    expect((await placeOrder(api, { discountCode: 'WELCOME20' })).statusCode).toBe(201);

    await drain(ctx.infra);
    await api.post('/api/cart/items', { variantId: boot, quantity: 1 });
    const again = await quote(api, { discountCode: 'WELCOME20', email: 'ana@example.com' });
    expect(again.discountError).toBe('Ya usaste este código');
    const rejected = await placeOrder(api, { discountCode: 'WELCOME20', expectedTotalCents: again.totals.totalCents });
    expect(rejected.json()).toMatchObject({ code: 'INVALID_DISCOUNT', meta: { reason: 'ALREADY_USED' } });
  });

  it('compra como invitado con el carrito de la cookie; sin email → 400', async () => {
    const first = await client(ctx.app).post('/api/cart/items', { variantId: boot, quantity: 1 });
    const guest = client(ctx.app, sessionCookie(first, 'rs_cart'));
    expect((await guest.post('/api/checkout/orders', { shippingAddress: ADDRESS, shippingMethod: 'standard', card: CARD(), expectedTotalCents: 46_000 }, { 'idempotency-key': crypto.randomUUID() })).statusCode).toBe(400);
    const res = await placeOrder(guest, { email: 'invitada@example.com' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ email: 'invitada@example.com', status: 'paid' });
  });

  it('timeout del proveedor → 202 pendiente con reserva; al vencer se cancela y libera', async () => {
    const api = await customer();
    await api.post('/api/cart/items', { variantId: boot, quantity: 3 });
    const res = await placeOrder(api, { card: CARD('4000 0000 0000 0119') });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('pending_payment');
    expect(await stock(boot)).toEqual({ on_hand: 10, reserved: 3 });

    await ctx.infra.writeDb.query(`UPDATE orders SET reservation_expires_at = now() - interval '1 minute'`);
    const ordering = createOrderingModule({ writeDb: ctx.infra.writeDb, readDb: ctx.infra.readDb, guards: {} as AuthGuards, metrics: new Metrics(), logger: silentLogger, guestCartId: () => null });
    expect(await ordering.admin.expirePending()).toBe(1);
    expect(await stock(boot)).toEqual({ on_hand: 10, reserved: 0 });
  });

  it('administración: listar, enviar con seguimiento y cancelar un pagado (reintegro + reposición)', async () => {
    const api = await customer();
    await api.post('/api/cart/items', { variantId: boot, quantity: 1 });
    const o1 = (await placeOrder(api)).json<OrderDetail>();
    await drain(ctx.infra); // la política vacía el carrito tras el pago
    await api.post('/api/cart/items', { variantId: boot, quantity: 2 });
    const o2 = (await placeOrder(api)).json<OrderDetail>();
    await drain(ctx.infra);

    const admin = client(ctx.app, await loginAdmin(ctx.app));
    expect((await api.get('/api/admin/orders')).statusCode).toBe(403);
    const list = (await admin.get('/api/admin/orders?status=paid')).json();
    expect(list.items.map((o: { number: string }) => o.number).sort()).toEqual([o1.number, o2.number].sort());

    const shipped = await admin.post(`/api/admin/orders/${o1.number}/ship`, { expectedVersion: o1.version, trackingCode: 'AR123456' });
    expect(shipped.json()).toMatchObject({ status: 'shipped', trackingCode: 'AR123456' });
    const cantCancel = await admin.post(`/api/admin/orders/${o1.number}/cancel`, { expectedVersion: shipped.json().version, reason: 'cliente' });
    expect(cantCancel.json().code).toBe('INVALID_TRANSITION');

    expect(await stock(boot)).toEqual({ on_hand: 7, reserved: 0 });
    const cancelled = await admin.post(`/api/admin/orders/${o2.number}/cancel`, { expectedVersion: o2.version, reason: 'Pedido duplicado' });
    expect(cancelled.json()).toMatchObject({ status: 'cancelled', payment: { status: 'refunded' } });
    expect(await stock(boot)).toEqual({ on_hand: 9, reserved: 0 });

    await drain(ctx.infra);
    expect((await api.get(`/api/orders/${o1.number}`)).json()).toMatchObject({ status: 'shipped', trackingCode: 'AR123456' });
  });

  it('un cliente no ve pedidos ajenos', async () => {
    const ana = await customer();
    await ana.post('/api/cart/items', { variantId: boot, quantity: 1 });
    const order = (await placeOrder(ana)).json<OrderDetail>();
    await drain(ctx.infra);
    const bea = await customer('bea@example.com');
    expect((await bea.get(`/api/orders/${order.number}`)).statusCode).toBe(404);
  });
});
