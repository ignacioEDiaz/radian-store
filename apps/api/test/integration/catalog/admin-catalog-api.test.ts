import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdminProduct } from '@radian/contracts';
import { client, fullApp, loginAdmin, multipartFile, resetAll } from '../../support/full-app.js';
import { fakePngThatIsPdf, jpegWithExif, png } from '../../support/images.js';

let ctx: Awaited<ReturnType<typeof fullApp>>;
let api: ReturnType<typeof client>;

beforeAll(async () => {
  ctx = await fullApp();
});
afterAll(() => ctx.close());

beforeEach(async () => {
  await resetAll(ctx.infra);
  await ctx.infra.projector.runOnce(); // nada pendiente
  // el admin se recrea en cada test
  const { createContexts } = await import('../../../src/modules/index.js');
  void createContexts;
  await ctx.app.inject({ method: 'GET', url: '/health/live' });
  api = client(ctx.app);
});

async function adminApi() {
  // EnsureAdmin corre al arrancar; tras el reset lo recreamos registrando y promoviendo vía SQL de test.
  await ctx.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    payload: { name: 'Admin', email: 'admin@radian.store', password: 'admin-password-123' },
  });
  await ctx.infra.writeDb.query(`UPDATE customers SET role = 'admin'`);
  await ctx.infra.projector.runOnce();
  await ctx.infra.readDb.query(`UPDATE customer_profiles SET role = 'admin'`);
  await ctx.infra.redis.flushdb();
  return client(ctx.app, await loginAdmin(ctx.app));
}

async function upload(a: ReturnType<typeof client>, data: Buffer, name = 'foto.jpg', type = 'image/jpeg') {
  const { body, contentType } = multipartFile(data, name, type);
  void a;
  const cookie = await loginAdmin(ctx.app);
  return ctx.app.inject({ method: 'POST', url: '/api/admin/media', headers: { 'content-type': contentType, cookie, origin: 'http://localhost:5173' }, payload: body });
}

const product = { title: 'Test Coat', description: 'Un abrigo', productType: 'Outerwear', materials: ['Wool'], tags: [], priceCents: 30000, compareAtCents: 40000 };

describe('Administración del catálogo (API real)', () => {
  it('solo administradores: 401 sin sesión y 403 con cliente', async () => {
    expect((await api.get('/api/admin/products')).statusCode).toBe(401);
    const reg = await api.post('/api/auth/register', { name: 'Cli', email: 'cli@example.com', password: 'una-clave-larga' });
    const cookie = String(reg.headers['set-cookie']).split(';')[0]!;
    await ctx.infra.projector.runOnce();
    expect((await client(ctx.app, cookie).get('/api/admin/products')).statusCode).toBe(403);
  });

  it('flujo completo: crear, variantes con stock, imágenes, publicar y ver en lectura', async () => {
    const admin = await adminApi();
    const created = await admin.post('/api/admin/products', product);
    expect(created.statusCode).toBe(201);
    let p = created.json<AdminProduct>();
    expect(p).toMatchObject({ slug: 'test-coat', status: 'draft', version: 1 });

    for (const [color, size] of [['Black', 'S'], ['Black', 'M'], ['Oxblood', 'S']] as const) {
      const r = await admin.post(`/api/admin/products/${p.id}/variants`, { expectedVersion: p.version, sku: `TC-${color[0]}-${size}`, color, size, initialStock: 3 });
      expect(r.statusCode).toBe(201);
      p = r.json();
    }
    expect(p.variants.map((v) => [v.sku, v.onHand, v.available])).toEqual([
      ['TC-B-S', 3, 3],
      ['TC-B-M', 3, 3],
      ['TC-O-S', 3, 3],
    ]);

    const notPublishable = await admin.post(`/api/admin/products/${p.id}/publish`, { expectedVersion: p.version });
    expect(notPublishable.statusCode).toBe(422);
    expect(notPublishable.json().meta.reasons).toEqual(['NO_IMAGES']);

    const up = await upload(admin, await jpegWithExif(1400, 1800));
    expect(up.statusCode).toBe(201);
    const media = up.json();
    expect(media.widths).toEqual([320, 640, 960, 1280]);
    const again = await upload(admin, await jpegWithExif(1400, 1800));
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(media.id);

    p = (await admin.post(`/api/admin/products/${p.id}/images`, { expectedVersion: p.version, mediaId: media.id, alt: 'Frente', color: 'Black' })).json();
    const published = await admin.post(`/api/admin/products/${p.id}/publish`, { expectedVersion: p.version });
    expect(published.statusCode).toBe(200);
    p = published.json();
    expect(p.status).toBe('published');

    await ctx.infra.projector.runOnce();
    const errs = await ctx.infra.writeDb.query('SELECT 1 FROM outbox WHERE last_error IS NOT NULL');
    expect(errs.rows).toEqual([]);
    const read = await admin.get(`/api/admin/products/${p.id}`);
    expect(read.json()).toMatchObject({ status: 'published', version: p.version, images: [{ alt: 'Frente' }] });
    expect(read.json().variants.map((v: { onHand: number }) => v.onHand)).toEqual([3, 3, 3]);
    const { rows } = await ctx.infra.readDb.query('SELECT available, colors, sizes FROM catalog_products WHERE id = $1', [p.id]);
    expect(rows[0]).toMatchObject({ available: true, colors: ['Black', 'Oxblood'] });

    const img = await ctx.app.inject({ method: 'GET', url: `/media/${media.id}/640.webp` });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/webp');
    expect(img.headers['cache-control']).toContain('immutable');
    const cached = await ctx.app.inject({ method: 'GET', url: `/media/${media.id}/640.webp`, headers: { 'if-none-match': String(img.headers.etag) } });
    expect(cached.statusCode).toBe(304);
    expect((await ctx.app.inject({ method: 'GET', url: `/media/${media.id}/1920.webp` })).statusCode).toBe(404);
  });

  it('conflicto de versión, SKU repetido entre productos y slug con sufijo', async () => {
    const admin = await adminApi();
    const a = (await admin.post('/api/admin/products', product)).json<AdminProduct>();
    const b = (await admin.post('/api/admin/products', product)).json<AdminProduct>();
    expect(b.slug).toBe('test-coat-2');
    await admin.patch(`/api/admin/products/${a.id}`, { expectedVersion: a.version, title: 'Primero' });
    const stale = await admin.patch(`/api/admin/products/${a.id}`, { expectedVersion: a.version, title: 'Segundo' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('VERSION_CONFLICT');
    await admin.post(`/api/admin/products/${b.id}/variants`, { expectedVersion: b.version, sku: 'DUP-1', color: 'Black', size: 'S' });
    const fresh = (await admin.get(`/api/admin/products/${a.id}`)).json<AdminProduct>();
    void fresh;
    const latest = (await ctx.infra.writeDb.query<{ version: number }>('SELECT version FROM products WHERE id = $1', [a.id])).rows[0]!.version;
    const dup = await admin.post(`/api/admin/products/${a.id}/variants`, { expectedVersion: latest, sku: 'DUP-1', color: 'Black', size: 'S' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe('SKU_TAKEN');
  });

  it('ajuste de stock: rechaza negativos, registra movimiento y proyecta disponibilidad', async () => {
    const admin = await adminApi();
    let p = (await admin.post('/api/admin/products', product)).json<AdminProduct>();
    p = (await admin.post(`/api/admin/products/${p.id}/variants`, { expectedVersion: p.version, sku: 'ST-1', color: 'Black', size: 'S', initialStock: 2 })).json();
    const variantId = p.variants[0]!.id;
    const bad = await admin.post(`/api/admin/inventory/${variantId}/adjustments`, { delta: -3, reason: 'damage' });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().code).toBe('NEGATIVE_STOCK');
    const ok = await admin.post(`/api/admin/inventory/${variantId}/adjustments`, { delta: -2, reason: 'damage' });
    expect(ok.json()).toEqual({ variantId, onHand: 0, reserved: 0, available: 0 });
    await ctx.infra.projector.runOnce();
    const { rows } = await ctx.infra.readDb.query('SELECT available FROM catalog_products WHERE id = $1', [p.id]);
    expect(rows[0]!.available).toBe(false);
    const moves = await ctx.infra.writeDb.query('SELECT delta, reason FROM stock_movements WHERE variant_id = $1 ORDER BY id', [variantId]);
    expect(moves.rows).toEqual([
      { delta: 2, reason: 'initial' },
      { delta: -2, reason: 'damage' },
    ]);
  });

  it('subidas inválidas: no-imagen → 415; imagen chica se guarda sin agrandar', async () => {
    const admin = await adminApi();
    const bad = await upload(admin, fakePngThatIsPdf, 'trucho.png', 'image/png');
    expect(bad.statusCode).toBe(415);
    const small = await upload(admin, await png(300, 300), 'chica.png', 'image/png');
    expect(small.json().widths).toEqual([300]);
  });

  it('colecciones: orden sin duplicados y el producto archivado sale de la colección', async () => {
    const admin = await adminApi();
    const p1 = (await admin.post('/api/admin/products', product)).json<AdminProduct>();
    const p2 = (await admin.post('/api/admin/products', { ...product, title: 'Otro' })).json<AdminProduct>();
    const col = (await admin.post('/api/admin/collections', { title: 'Abrigos' })).json();
    const set = await admin.put(`/api/admin/collections/${col.id}/products`, { expectedVersion: col.version, productIds: [p2.id, p1.id, p2.id] });
    expect(set.json().productIds).toEqual([p2.id, p1.id]);
    const unknown = await admin.put(`/api/admin/collections/${col.id}/products`, { expectedVersion: set.json().version, productIds: [crypto.randomUUID()] });
    expect(unknown.json().code).toBe('UNKNOWN_PRODUCT');
    await admin.post(`/api/admin/products/${p2.id}/archive`, { expectedVersion: p2.version });
    await ctx.infra.projector.runOnce(); // política: quita el archivado
    await ctx.infra.projector.runOnce(); // proyecta la colección actualizada
    const cols = (await admin.get('/api/admin/collections')).json();
    expect(cols[0]).toMatchObject({ title: 'Abrigos', productIds: [p1.id] });
  });
});
