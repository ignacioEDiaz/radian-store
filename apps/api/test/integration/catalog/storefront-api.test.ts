import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProductDetail, ProductList } from '@radian/contracts';
import { fullApp, resetAll } from '../../support/full-app.js';
import { drain, seedCatalog } from '../../support/catalog-seed.js';

let ctx: Awaited<ReturnType<typeof fullApp>>;
let seeded: Awaited<ReturnType<typeof seedCatalog>>;

beforeAll(async () => {
  ctx = await fullApp();
  await resetAll(ctx.infra);
  seeded = await seedCatalog(ctx.infra, ctx.mediaDir, [
    { title: 'Sharp Leather Boot', type: 'Footwear', materials: ['Leather'], price: 45_000, featuredRank: 1, variants: [{ color: 'Obsidian Black', size: 'M', stock: 3 }, { color: 'Oxblood Burgundy', size: 'S', stock: 2 }] },
    { title: 'Leather Tee', type: 'Tops', materials: ['Leather', 'Cotton'], price: 32_500, compareAt: 44_000, featuredRank: 2, variants: [{ color: 'Obsidian Black', size: 'S', stock: 4 }, { color: 'Obsidian Black', size: 'M', stock: 0 }] },
    { title: 'Raven Trench', type: 'Outerwear', materials: ['Wool'], price: 26_000, variants: [{ color: 'Obsidian Black', size: 'L', stock: 1 }] },
    { title: 'Ghost Mesh', type: 'Tops', materials: ['Chiffon'], price: 30_500, variants: [{ color: 'Oxblood Burgundy', size: 'M', stock: 0 }] },
    { title: 'Hidden Draft', price: 1_000, publish: false },
    ...Array.from({ length: 22 }, (_, i) => ({ title: `Basic Tee ${i + 1}`, price: 5_000 + i * 100 })),
  ]);
  const { collections } = seeded.catalog;
  const col = await collections.create({ title: 'Leathers', description: 'Cuero', imageMediaId: null });
  await collections.setProducts({ collectionId: col.id, expectedVersion: col.version, productIds: [seeded.products[1]!.id, seeded.products[0]!.id] });
  await drain(ctx.infra);
});
afterAll(() => ctx.close());

const get = async <T>(url: string, headers: Record<string, string> = {}) => {
  const res = await ctx.app.inject({ method: 'GET', url, headers });
  return { res, body: (res.body ? res.json() : null) as T };
};

describe('GET /api/catalog/products', () => {
  it('pagina de a 24 con total correcto y solo publicados', async () => {
    const { body } = await get<ProductList>('/api/catalog/products');
    expect(body.total).toBe(26);
    expect(body.items).toHaveLength(24);
    expect(body.items.some((p) => p.title === 'Hidden Draft')).toBe(false);
    const page2 = await get<ProductList>('/api/catalog/products?page=2');
    expect(page2.body.items).toHaveLength(2);
    const out = await get<ProductList>('/api/catalog/products?page=9');
    expect(out.body).toMatchObject({ items: [], total: 26 });
  });

  it('orden por destacados primero y por precio', async () => {
    const featured = await get<ProductList>('/api/catalog/products');
    expect(featured.body.items.slice(0, 2).map((p) => p.title)).toEqual(['Sharp Leather Boot', 'Leather Tee']);
    const asc = await get<ProductList>('/api/catalog/products?sort=price_desc');
    expect(asc.body.items[0]!.title).toBe('Sharp Leather Boot');
  });

  it('filtra por color y talle disponibles y calcula facetas excluyendo el propio filtro', async () => {
    const { body } = await get<ProductList>('/api/catalog/products?color=Obsidian%20Black&size=M&available=true');
    expect(body.items.map((p) => p.title)).toEqual(['Sharp Leather Boot']);
    // la faceta de color no está restringida por el color elegido
    const colors = Object.fromEntries(body.facets.colors.map((f) => [f.value, f.count]));
    expect(colors['Obsidian Black']).toBe(1);
    expect(body.facets.sizes.find((f) => f.value === 'M')).toBeDefined();
  });

  it('marca agotados y filtra por material y precio', async () => {
    const { body } = await get<ProductList>('/api/catalog/products?type=Tops&material=Chiffon');
    expect(body.items).toEqual([expect.objectContaining({ title: 'Ghost Mesh', available: false })]);
    const range = await get<ProductList>('/api/catalog/products?minPrice=30000&maxPrice=40000');
    expect(range.body.items.map((p) => p.title).sort()).toEqual(['Ghost Mesh', 'Leather Tee']);
    expect(range.body.facets.price).toEqual({ min: expect.any(Number), max: expect.any(Number) });
  });

  it('filtra por colección respetando su orden manual', async () => {
    const { body } = await get<ProductList>('/api/catalog/products?collection=leathers');
    expect(body.items.map((p) => p.title)).toEqual(['Leather Tee', 'Sharp Leather Boot']);
  });

  it('400 con filtros inválidos', async () => {
    const { res } = await get('/api/catalog/products?minPrice=500&maxPrice=100');
    expect(res.statusCode).toBe(400);
  });

  it('tarjetas con imagen responsiva, precio anterior e isNew', async () => {
    const { body } = await get<ProductList>('/api/catalog/products?q=leather%20tee');
    const card = body.items.find((p) => p.title === 'Leather Tee')!;
    expect(card).toMatchObject({ compareAtCents: 44_000, isNew: true, colors: ['Obsidian Black'] });
    expect(card.image!.srcset[0]).toMatchObject({ width: expect.any(Number), url: expect.stringMatching(/^\/media\//) });
  });
});

describe('detalle, búsqueda, colecciones y portada', () => {
  it('detalle con variantes, disponibilidad y relacionados; 404 si no está publicado', async () => {
    const { body } = await get<ProductDetail>('/api/catalog/products/sharp-leather-boot');
    expect(body.options).toEqual({ colors: ['Obsidian Black', 'Oxblood Burgundy'], sizes: ['S', 'M'] }); // escala de talles, no alfabético
    expect(body.variants).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: 'Oxblood Burgundy', size: 'S', available: true, availableQty: 2 })]),
    );
    expect(body.related.map((r) => r.title)).toContain('Leather Tee');
    expect((await get('/api/catalog/products/hidden-draft')).res.statusCode).toBe(404);
  });

  it('búsqueda tolerante a errores y sugerencias acotadas', async () => {
    const typo = await get<ProductList>('/api/catalog/products?q=leathr');
    expect(typo.body.items.map((p) => p.title)).toEqual(expect.arrayContaining(['Sharp Leather Boot', 'Leather Tee']));
    const sugg = await get<{ products: { title: string }[]; collections: { slug: string }[] }>('/api/catalog/search/suggestions?q=lea');
    expect(sugg.body.products.length).toBeGreaterThan(0);
    expect(sugg.body.products.length).toBeLessThanOrEqual(6);
    expect(sugg.body.collections.map((c) => c.slug)).toContain('leathers');
  });

  it('colecciones y portada', async () => {
    const cols = await get<{ slug: string; productCount: number; image: unknown }[]>('/api/catalog/collections');
    expect(cols.body).toEqual([expect.objectContaining({ slug: 'leathers', productCount: 2, image: expect.anything() })]);
    const home = await get<{ newArrivals: unknown[]; bestSellers: { title: string }[]; featuredCollections: unknown[] }>('/api/catalog/home');
    expect(home.body.newArrivals.length).toBeGreaterThan(0);
    expect(home.body.bestSellers[0]!.title).toBe('Sharp Leather Boot');
    expect(home.body.featuredCollections).toHaveLength(1);
  });
});

describe('caché y validadores HTTP', () => {
  it('ETag + 304 y la segunda consulta sale de la caché', async () => {
    const first = await get('/api/catalog/products?color=Oxblood%20Burgundy');
    const etag = String(first.res.headers.etag);
    expect(etag).toMatch(/^"/);
    const second = await get('/api/catalog/products?color=Oxblood%20Burgundy', { 'if-none-match': etag });
    expect(second.res.statusCode).toBe(304);
    const metrics = await ctx.app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.body).toMatch(/cache_requests_total\{name="catalog.list",result="hit"\} [1-9]/);
  });

  it('un cambio de precio invalida la caché y se ve enseguida', async () => {
    const before = await get<ProductDetail>('/api/catalog/products/raven-trench');
    expect(before.body.priceCents).toBe(26_000);
    const raven = seeded.products.find((p) => p.title === 'Raven Trench')!;
    await seeded.catalog.products.updateDetails({ productId: raven.id, expectedVersion: raven.version, priceCents: 21_000 });
    await drain(ctx.infra);
    const after = await get<ProductDetail>('/api/catalog/products/raven-trench');
    expect(after.body.priceCents).toBe(21_000);
    const list = await get<ProductList>('/api/catalog/products?q=raven');
    expect(list.body.items[0]!.priceCents).toBe(21_000);
  });
});
