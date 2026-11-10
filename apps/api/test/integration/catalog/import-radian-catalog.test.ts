import { mkdtempSync, writeFileSync, copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fullApp, resetAll } from '../../support/full-app.js';
import { createCatalogModule } from '../../../src/modules/catalog/index.js';
import { createMediaModule } from '../../../src/modules/media/index.js';
import { importCatalog } from '../../../src/modules/catalog/infrastructure/seed/import-catalog.js';
import { Metrics } from '../../../src/shared/infrastructure/observability/metrics.js';
import type { AuthGuards } from '../../../src/shared/infrastructure/http/auth.js';

const SEED = fileURLToPath(new URL('../../../seed/radian/', import.meta.url));
let ctx: Awaited<ReturnType<typeof fullApp>>;
let seedDir: string;

beforeAll(async () => {
  ctx = await fullApp();
  await resetAll(ctx.infra);
  // Catálogo reducido: 2 productos y sus colecciones.
  const full = JSON.parse(readFileSync(path.join(SEED, 'catalog.json'), 'utf8'));
  const products = full.products.slice(0, 2);
  const handles = new Set(products.map((p: { handle: string }) => p.handle));
  const collections = full.collections
    .map((c: { products: string[] }) => ({ ...c, products: c.products.filter((h) => handles.has(h)) }))
    .filter((c: { products: string[] }) => c.products.length);
  seedDir = mkdtempSync(path.join(tmpdir(), 'radian-seed-'));
  mkdirSync(path.join(seedDir, 'images'));
  for (const p of products) for (const img of p.images) copyFileSync(path.join(SEED, 'images', img.file), path.join(seedDir, 'images', img.file));
  writeFileSync(path.join(seedDir, 'catalog.json'), JSON.stringify({ products, collections }));
});
afterAll(() => ctx.close());

describe('importCatalog', () => {
  it('crea y publica productos con variantes, stock, imágenes y colecciones; repetirlo no duplica', async () => {
    const noGuards = {} as AuthGuards;
    const catalog = createCatalogModule({ writeDb: ctx.infra.writeDb, readDb: ctx.infra.readDb, guards: noGuards });
    const media = createMediaModule({ writeDb: ctx.infra.writeDb, guards: noGuards, metrics: new Metrics(), mediaDir: ctx.mediaDir });
    const deps = { writeDb: ctx.infra.writeDb, products: catalog.products, collections: catalog.collections, upload: media.upload, seedDir, log: () => {} };

    const first = await importCatalog(deps);
    expect(first.productsCreated).toBe(2);
    expect(first.collectionsCreated).toBeGreaterThan(0);

    const second = await importCatalog(deps);
    expect(second).toMatchObject({ productsCreated: 0, collectionsCreated: 0 });

    const { rows } = await ctx.infra.writeDb.query<{ status: string; variants: number; images: number; stock: number }>(
      `SELECT p.status,
              (SELECT count(*)::int FROM product_variants v WHERE v.product_id = p.id) AS variants,
              (SELECT count(*)::int FROM product_images i WHERE i.product_id = p.id) AS images,
              (SELECT count(*)::int FROM inventory_items s WHERE s.product_id = p.id) AS stock
         FROM products p`,
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.status).toBe('published');
      expect(r.variants).toBeGreaterThan(0);
      expect(r.images).toBeGreaterThan(0);
      expect(r.stock).toBe(r.variants);
    }
    // Las URLs del tema apuntan a los handles originales: el slug debe ser el handle, no el título.
    const seed = JSON.parse(readFileSync(path.join(seedDir, 'catalog.json'), 'utf8')) as { products: { handle: string }[]; collections: { handle: string }[] };
    const slugs = await ctx.infra.writeDb.query<{ slug: string }>('SELECT slug FROM products ORDER BY slug');
    expect(slugs.rows.map((r) => r.slug)).toEqual(seed.products.map((p) => p.handle).sort());
    expect(slugs.rows.map((r) => r.slug)).toContain('sharp-boot');
    const collectionSlugs = await ctx.infra.writeDb.query<{ slug: string }>('SELECT slug FROM collections ORDER BY slug');
    expect(collectionSlugs.rows.map((r) => r.slug)).toEqual(seed.collections.map((c) => c.handle).sort());

    const mediaRows = await ctx.infra.writeDb.query<{ n: number }>('SELECT count(*)::int AS n FROM media_assets');
    expect(mediaRows.rows[0]!.n).toBeGreaterThan(0);
  });
});
