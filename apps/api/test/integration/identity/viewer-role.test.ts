import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrderDetail } from '@radian/contracts';
import { ORIGIN, client, fullApp, loginAdmin, resetAll, sessionCookie } from '../../support/full-app.js';
import { drain, seedCatalog } from '../../support/catalog-seed.js';

let ctx: Awaited<ReturnType<typeof fullApp>>;
let viewer: ReturnType<typeof client>;
let order: OrderDetail;

const json = { 'content-type': 'application/json', origin: ORIGIN };

async function account(email: string, role: 'admin' | 'viewer' | 'customer') {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/register', headers: json, payload: { name: 'Persona', email, password: role === 'admin' ? 'admin-password-123' : 'una-clave-larga' } });
  if (role !== 'customer') await ctx.infra.writeDb.query('UPDATE customers SET role = $2 WHERE email = $1', [email, role]);
  await drain(ctx.infra);
  if (role !== 'customer') await ctx.infra.readDb.query('UPDATE customer_profiles SET role = $2 WHERE email = $1', [email, role]);
  await ctx.infra.redis.flushdb();
  return sessionCookie(res);
}

/** Huella de los datos de negocio: si un viewer cambiara algo, cambiaría. */
async function fingerprint() {
  const { rows } = await ctx.infra.writeDb.query<{ f: string }>(
    `SELECT md5(string_agg(t, '|' ORDER BY t)) AS f FROM (
       SELECT 'p' || id || version FROM products UNION ALL SELECT 'i' || variant_id || on_hand || reserved FROM inventory_items
       UNION ALL SELECT 'c' || id || version FROM collections UNION ALL SELECT 'o' || id || version FROM orders
       UNION ALL SELECT 'm' || id FROM media_assets) x(t)`,
  );
  return rows[0]!.f;
}

beforeAll(async () => {
  ctx = await fullApp();
  await resetAll(ctx.infra);
  await seedCatalog(ctx.infra, ctx.mediaDir, [{ title: 'Sharp Leather Boot', price: 45_000, variants: [{ color: 'Black', size: 'M', stock: 5 }] }]);
  await account('admin@radian.store', 'admin');
  const buyer = client(ctx.app, await account('ana@example.com', 'customer'));
  const variantId = (await ctx.app.inject({ method: 'GET', url: '/api/catalog/products/sharp-leather-boot' })).json().variants[0].id;
  await buyer.post('/api/cart/items', { variantId, quantity: 1 });
  const q = (await buyer.post('/api/checkout/quote', { shippingMethod: 'standard' })).json();
  order = (
    await buyer.post(
      '/api/checkout/orders',
      {
        email: 'ana@example.com',
        shippingAddress: { recipient: 'Ana Pérez', line1: 'Av. Corrientes 1234', line2: 'Piso 3', city: 'CABA', region: 'CABA', postalCode: '1043', country: 'AR', phone: '+54 11 5555 1234' },
        shippingMethod: 'standard',
        card: { number: '4242424242424242', expMonth: 12, expYear: 2030, cvc: '123', holder: 'Ana' },
        expectedTotalCents: q.totals.totalCents,
      },
      { 'idempotency-key': crypto.randomUUID() },
    )
  ).json();
  await drain(ctx.infra);
  viewer = client(ctx.app, await account('demo@radian.store', 'viewer'));
});
afterAll(() => ctx.close());

describe('Rol viewer (solo lectura)', () => {
  it('ve el panel: productos, colecciones y pedidos', async () => {
    expect((await viewer.get('/api/admin/products')).statusCode).toBe(200);
    expect((await viewer.get('/api/admin/collections')).statusCode).toBe(200);
    expect((await viewer.get('/api/admin/orders')).json().items).toHaveLength(1);
  });

  it('TODA ruta de modificación del área admin lo rechaza con READ_ONLY_ACCOUNT y nada cambia', async () => {
    const mutations = ctx.app.registeredRoutes.filter((r) => r.url.startsWith('/api/admin') && !['GET', 'HEAD', 'OPTIONS'].includes(r.method));
    expect(mutations.length).toBeGreaterThan(15);
    const before = await fingerprint();
    for (const r of mutations) {
      const url = r.url.replace(':number', order.number).replace(/:[a-zA-Z]+/g, crypto.randomUUID());
      const res = await viewer[r.method.toLowerCase() as 'post' | 'put' | 'patch' | 'delete'](url, {});
      expect({ route: `${r.method} ${r.url}`, status: res.statusCode, code: res.json().code }).toEqual({ route: `${r.method} ${r.url}`, status: 403, code: 'READ_ONLY_ACCOUNT' });
    }
    await drain(ctx.infra);
    expect(await fingerprint()).toBe(before);
  });

  it('el admin sigue pudiendo modificar', async () => {
    const admin = client(ctx.app, await loginAdmin(ctx.app));
    const res = await admin.post('/api/admin/collections', { title: 'Solo admin' });
    expect(res.statusCode).toBe(201);
  });

  it('ve los pedidos con datos personales enmascarados (productos y totales completos)', async () => {
    const list = (await viewer.get('/api/admin/orders')).json();
    expect(list.items[0].email).toBe('a***@example.com');
    const detail = (await viewer.get(`/api/admin/orders/${order.number}`)).json<OrderDetail>();
    expect(detail.email).toBe('a***@example.com');
    expect(detail.shippingAddress).toMatchObject({ recipient: 'A***', line1: '•••', city: 'CABA', country: 'AR', postalCode: '10••', phone: '•••• 34' });
    expect(detail.shippingAddress.line2).toBeUndefined();
    expect(detail.lines[0]).toMatchObject({ title: 'Sharp Leather Boot' });
    expect(detail.totals.totalCents).toBe(order.totals.totalCents);
    expect(JSON.stringify(detail)).not.toMatch(/Corrientes|5555 1234|ana@example/);

    const admin = client(ctx.app, await loginAdmin(ctx.app));
    expect((await admin.get(`/api/admin/orders/${order.number}`)).json().email).toBe('ana@example.com');
  });
});
