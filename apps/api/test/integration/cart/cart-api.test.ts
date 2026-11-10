import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CartView } from '@radian/contracts';
import { ORIGIN, fullApp, resetAll, sessionCookie } from '../../support/full-app.js';
import { drain, seedCatalog } from '../../support/catalog-seed.js';
import { createCartModule } from '../../../src/modules/cart/index.js';
import { Metrics } from '../../../src/shared/infrastructure/observability/metrics.js';
import { silentLogger } from '../../support/logger.js';
import type { AuthGuards } from '../../../src/shared/infrastructure/http/auth.js';

let ctx: Awaited<ReturnType<typeof fullApp>>;
let seeded: Awaited<ReturnType<typeof seedCatalog>>;
let v: { boot: string; tee: string; lowStock: string };

beforeAll(async () => {
  ctx = await fullApp();
});
afterAll(() => ctx.close());

beforeEach(async () => {
  await resetAll(ctx.infra);
  seeded = await seedCatalog(ctx.infra, ctx.mediaDir, [
    { title: 'Sharp Leather Boot', price: 45_000, variants: [{ color: 'Black', size: 'M', stock: 20 }] },
    { title: 'Leather Tee', price: 32_500, variants: [{ color: 'Black', size: 'S', stock: 20 }] },
    { title: 'Ghost Mesh', price: 30_500, variants: [{ color: 'Black', size: 'L', stock: 2 }] },
  ]);
  v = { boot: seeded.products[0]!.variants[0]!.id, tee: seeded.products[1]!.variants[0]!.id, lowStock: seeded.products[2]!.variants[0]!.id };
});

function api(cookie = '') {
  const headers = (json: boolean) => ({ origin: ORIGIN, ...(cookie ? { cookie } : {}), ...(json ? { 'content-type': 'application/json' } : {}) });
  return {
    add: (variantId: string, quantity = 1) => ctx.app.inject({ method: 'POST', url: '/api/cart/items', headers: headers(true), payload: { variantId, quantity } }),
    change: (lineId: string, quantity: number) => ctx.app.inject({ method: 'PATCH', url: `/api/cart/items/${lineId}`, headers: headers(true), payload: { quantity } }),
    remove: (lineId: string) => ctx.app.inject({ method: 'DELETE', url: `/api/cart/items/${lineId}`, headers: headers(false) }),
    get: () => ctx.app.inject({ method: 'GET', url: '/api/cart', headers: headers(false) }),
  };
}

async function register(email: string) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    payload: { name: 'Ana', email, password: 'una-clave-larga' },
  });
  await drain(ctx.infra);
  return sessionCookie(res);
}

describe('Carrito de visitante', () => {
  it('el primer agregado emite la cookie firmada; luego se suman cantidades y el total lo calcula el backend', async () => {
    const first = await api().add(v.boot);
    expect(first.statusCode).toBe(200);
    const cookie = sessionCookie(first, 'rs_cart');
    expect(String(first.headers['set-cookie'])).toMatch(/HttpOnly/);
    await api(cookie).add(v.boot, 2);
    const cart = (await api(cookie).add(v.tee)).json<CartView>();
    expect(cart).toMatchObject({ itemCount: 4, subtotalCents: 3 * 45_000 + 32_500 });
    expect(cart.lines.map((l) => [l.title, l.quantity])).toEqual([
      ['Sharp Leather Boot', 3],
      ['Leather Tee', 1],
    ]);

    await drain(ctx.infra);
    const read = (await api(cookie).get()).json<CartView>();
    expect(read).toMatchObject({ id: cart.id, itemCount: 4, subtotalCents: cart.subtotalCents });
  });

  it('cookie adulterada → carrito nuevo sin error; sin cookie GET devuelve vacío', async () => {
    expect((await api().get()).json()).toMatchObject({ id: null, lines: [], itemCount: 0 });
    const res = await api('rs_cart=00000000-0000-4000-8000-000000000000.firma-falsa').add(v.tee);
    expect(res.statusCode).toBe(200);
    expect(res.json().itemCount).toBe(1);
  });

  it('respeta stock, límite por línea y valida variante', async () => {
    const low = await api().add(v.lowStock, 3);
    expect(low.statusCode).toBe(422);
    expect(low.json()).toMatchObject({ code: 'INSUFFICIENT_STOCK', meta: { available: 2 } });
    expect((await api().add(v.boot, 11)).statusCode).toBe(400);
    const missing = await api().add('11111111-1111-4111-8111-111111111111');
    expect(missing.statusCode).toBe(404);
  });

  it('cambia cantidad y quita líneas', async () => {
    const first = await api().add(v.boot);
    const cookie = sessionCookie(first, 'rs_cart');
    const lineId = first.json<CartView>().lines[0]!.lineId;
    expect((await api(cookie).change(lineId, 5)).json<CartView>().itemCount).toBe(5);
    expect((await api(cookie).remove(lineId)).json<CartView>()).toMatchObject({ lines: [], itemCount: 0 });
    expect((await api(cookie).remove(lineId)).statusCode).toBe(404);
  });

  it('dos agregados simultáneos sobre el mismo carrito no pierden líneas', async () => {
    const cookie = sessionCookie(await api().add(v.boot), 'rs_cart');
    await Promise.all([api(cookie).add(v.tee), api(cookie).add(v.lowStock)]);
    await drain(ctx.infra);
    expect((await api(cookie).get()).json<CartView>().lines).toHaveLength(3);
  });
});

describe('Carrito de cliente', () => {
  it('al iniciar sesión combina el carrito de visitante y expira la cookie', async () => {
    const session = await register('ana@example.com');
    await api(session).add(v.boot, 2);

    const guest = await api().add(v.boot, 3);
    const guestCookie = sessionCookie(guest, 'rs_cart');
    await api(guestCookie).add(v.tee);

    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: guestCookie },
      payload: { email: 'ana@example.com', password: 'una-clave-larga' },
    });
    expect(login.statusCode).toBe(200);
    expect(String(login.headers['set-cookie'])).toMatch(/rs_cart=;/);
    await drain(ctx.infra);
    const cart = (await api(sessionCookie(login)).get()).json<CartView>();
    expect(Object.fromEntries(cart.lines.map((l) => [l.title, l.quantity]))).toEqual({ 'Sharp Leather Boot': 5, 'Leather Tee': 1 });
    const { rows } = await ctx.infra.writeDb.query<{ n: number }>('SELECT count(*)::int AS n FROM carts');
    expect(rows[0]!.n).toBe(1);
  });

  it('avisa si cambió el precio y marca agotados (sin sumarlos al total)', async () => {
    const session = await register('bea@example.com');
    await api(session).add(v.boot);
    await api(session).add(v.lowStock, 2);
    const boot = seeded.products[0]!;
    await seeded.catalog.products.updateDetails({ productId: boot.id, expectedVersion: boot.version, priceCents: 40_000 });
    await ctx.app.inject({ method: 'GET', url: '/health/live' });
    const { createInventoryModule } = await import('../../../src/modules/inventory/index.js');
    await createInventoryModule({ writeDb: ctx.infra.writeDb, guards: {} as AuthGuards }).adjustStock.execute({ variantId: v.lowStock, delta: -2, reason: 'damage', actorId: null });
    await drain(ctx.infra);
    const cart = (await api(session).get()).json<CartView>();
    const byTitle = Object.fromEntries(cart.lines.map((l) => [l.title, l]));
    expect(byTitle['Sharp Leather Boot']).toMatchObject({ unitPriceCents: 40_000, previousUnitPriceCents: 45_000, warnings: ['PRICE_CHANGED'] });
    expect(byTitle['Ghost Mesh']).toMatchObject({ available: false, warnings: ['OUT_OF_STOCK'], lineTotalCents: 0 });
    expect(cart.subtotalCents).toBe(40_000);
  });
});

describe('Expiración de carritos de visitante', () => {
  it('elimina los inactivos hace más de 30 días y su snapshot de lectura', async () => {
    const cookie = sessionCookie(await api().add(v.boot), 'rs_cart');
    await drain(ctx.infra);
    await ctx.infra.writeDb.query(`UPDATE carts SET updated_at = now() - interval '40 days'`);
    const module = createCartModule({ writeDb: ctx.infra.writeDb, readDb: ctx.infra.readDb, guards: {} as AuthGuards, metrics: new Metrics(), logger: silentLogger, secureCookie: false });
    expect(await module.cart.expireGuestCarts()).toBe(1);
    await drain(ctx.infra);
    expect((await api(cookie).get()).json<CartView>()).toMatchObject({ id: null, itemCount: 0 });
  });
});
