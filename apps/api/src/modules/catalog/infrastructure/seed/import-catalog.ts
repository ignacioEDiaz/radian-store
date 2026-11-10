import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SqlExecutor } from '../../../../shared/infrastructure/db/pool.js';
import type { CollectionCommands } from '../../application/collection-commands.js';
import type { ProductCommands } from '../../application/product-commands.js';

interface SeedProduct {
  handle: string;
  title: string;
  description: string;
  productType: string;
  materials: string[];
  tags: string[];
  priceCents: number;
  compareAtCents: number | null;
  featuredRank: number | null;
  variants: { sku: string; color: string; size: string; initialStock: number }[];
  images: { file: string; alt: string; color: string | null }[];
}

interface SeedCollection {
  handle: string;
  title: string;
  description: string;
  products: string[];
}

export interface ImportDeps {
  writeDb: SqlExecutor;
  products: ProductCommands;
  collections: CollectionCommands;
  /** Subidor de imágenes (lo provee el contexto media). */
  upload: { execute(data: Buffer): Promise<{ asset: { id: string } }> };
  seedDir: string;
  log: (msg: string) => void;
}

/**
 * Importa el catálogo semilla usando los MISMOS casos de uso que el panel de administración
 * (validaciones, eventos y proyecciones incluidas). Idempotente: saltea productos (por SKU) y colecciones (por slug) existentes.
 */
export async function importCatalog(d: ImportDeps): Promise<{ productsCreated: number; collectionsCreated: number }> {
  const seed = JSON.parse(await readFile(path.join(d.seedDir, 'catalog.json'), 'utf8')) as { products: SeedProduct[]; collections: SeedCollection[] };
  const idsByHandle = new Map<string, string>();
  let productsCreated = 0;

  for (const p of seed.products) {
    // Clave de idempotencia: el primer SKU (único y estable entre corridas).
    const existing = await d.writeDb.query<{ id: string }>('SELECT product_id AS id FROM product_variants WHERE sku = $1', [p.variants[0]?.sku ?? '']);
    if (existing.rows[0]) {
      idsByHandle.set(p.handle, existing.rows[0].id);
      // Re-subir es idempotente (dedupe por sha256) y repara archivos faltantes en el almacenamiento.
      for (const img of p.images) await d.upload.execute(await readFile(path.join(d.seedDir, 'images', img.file)));
      continue;
    }
    let product = await d.products.createProduct({
      title: p.title,
      description: p.description,
      productType: p.productType,
      materials: p.materials,
      tags: p.tags,
      priceCents: p.priceCents,
      compareAtCents: p.compareAtCents,
    });
    const at = () => ({ productId: product.id, expectedVersion: product.version });
    for (const v of p.variants) {
      product = await d.products.addVariant({ ...at(), sku: v.sku, color: v.color, size: v.size, priceCents: null, initialStock: v.initialStock });
    }
    for (const img of p.images) {
      const { asset } = await d.upload.execute(await readFile(path.join(d.seedDir, 'images', img.file)));
      product = await d.products.attachImage({ ...at(), mediaId: asset.id, alt: img.alt, color: img.color });
    }
    if (p.featuredRank !== null) product = await d.products.setFeaturedRank({ ...at(), rank: p.featuredRank });
    product = await d.products.publish(at());
    idsByHandle.set(p.handle, product.id);
    productsCreated += 1;
    d.log(`  + ${p.title} (${p.variants.length} variantes, ${p.images.length} imágenes)`);
  }

  let collectionsCreated = 0;
  for (const c of seed.collections) {
    const exists = await d.writeDb.query('SELECT 1 FROM collections WHERE slug = $1', [c.handle]);
    if (exists.rows.length) continue;
    const created = await d.collections.create({ title: c.title, description: c.description, imageMediaId: null });
    const productIds = c.products.map((h) => idsByHandle.get(h)).filter((id): id is string => !!id);
    await d.collections.setProducts({ collectionId: created.id, expectedVersion: created.version, productIds });
    collectionsCreated += 1;
    d.log(`  + colección ${c.title} (${productIds.length} productos)`);
  }
  return { productsCreated, collectionsCreated };
}
