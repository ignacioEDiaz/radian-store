import type { EventConsumer } from '../../../../shared/infrastructure/outbox/consumer.js';
import type { TxClient } from '../../../../shared/infrastructure/db/pool.js';
import { refreshProductAvailability } from '../../../inventory/infrastructure/inventory-projection.js';
import { COLLECTION_EVENT_TYPES, PRODUCT_EVENT_TYPES, type CollectionSnapshot, type ProductSnapshot } from '../../domain/events.js';

export const catalogTags = {
  list: 'catalog:list',
  home: 'catalog:home',
  collections: 'catalog:collections',
  product: (id: string) => `catalog:product:${id}`,
  collection: (slug: string) => `catalog:collection:${slug}`,
};

/** Texto indexable: título, tipo, materiales, colores y etiquetas. */
function searchText(s: ProductSnapshot): string {
  const colors = [...new Set(s.variants.map((v) => v.color))];
  return [s.title, s.productType, ...s.materials, ...colors, ...s.tags].join(' ').toLowerCase();
}

async function projectProduct(tx: TxClient, s: ProductSnapshot): Promise<void> {
  const colors = [...new Set(s.variants.map((v) => v.color))];
  const prices = s.variants.map((v) => v.priceCents ?? s.priceCents);
  const minPrice = prices.length ? Math.min(...prices) : s.priceCents;
  const text = searchText(s);
  const { rowCount } = await tx.query(
    `INSERT INTO catalog_products (id, slug, status, title, product_type, materials, colors, min_price_cents, compare_at_cents,
        featured_rank, published_at, updated_at, search_tsv, search_text, doc, version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, to_tsvector('simple', $13), $13, $14, $15)
     ON CONFLICT (id) DO UPDATE SET slug=EXCLUDED.slug, status=EXCLUDED.status, title=EXCLUDED.title, product_type=EXCLUDED.product_type,
        materials=EXCLUDED.materials, colors=EXCLUDED.colors, min_price_cents=EXCLUDED.min_price_cents, compare_at_cents=EXCLUDED.compare_at_cents,
        featured_rank=EXCLUDED.featured_rank, published_at=EXCLUDED.published_at, updated_at=EXCLUDED.updated_at,
        search_tsv=EXCLUDED.search_tsv, search_text=EXCLUDED.search_text, doc=EXCLUDED.doc, version=EXCLUDED.version
     WHERE catalog_products.version < EXCLUDED.version`,
    [s.id, s.slug, s.status, s.title, s.productType, s.materials, colors, minPrice, s.compareAtCents, s.featuredRank, s.publishedAt, s.updatedAt, text, JSON.stringify(s), s.version],
  );
  if (rowCount === 0) return; // evento viejo: ya hay una versión más nueva proyectada

  const ids = s.variants.map((v) => v.id);
  await tx.query('DELETE FROM catalog_variants WHERE product_id = $1 AND NOT (variant_id = ANY($2::uuid[]))', [s.id, ids]);
  for (const v of s.variants) {
    await tx.query(
      `INSERT INTO catalog_variants (variant_id, product_id, sku, color, size, price_cents, position) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (variant_id) DO UPDATE SET sku=EXCLUDED.sku, color=EXCLUDED.color, size=EXCLUDED.size, price_cents=EXCLUDED.price_cents, position=EXCLUDED.position`,
      [v.id, s.id, v.sku, v.color, v.size, v.priceCents ?? s.priceCents, v.position],
    );
  }
  await refreshProductAvailability(tx, s.id);
}

async function projectCollection(tx: TxClient, s: CollectionSnapshot): Promise<void> {
  const { rowCount } = await tx.query(
    `INSERT INTO catalog_collections (id, slug, title, description, image, product_count, version, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET slug=EXCLUDED.slug, title=EXCLUDED.title, description=EXCLUDED.description, image=EXCLUDED.image,
       product_count=EXCLUDED.product_count, version=EXCLUDED.version, updated_at=EXCLUDED.updated_at
     WHERE catalog_collections.version < EXCLUDED.version`,
    [s.id, s.slug, s.title, s.description, s.image ? JSON.stringify(s.image) : null, s.productIds.length, s.version, s.updatedAt],
  );
  if (rowCount === 0) return;
  await tx.query('DELETE FROM catalog_collection_products WHERE collection_id = $1', [s.id]);
  if (s.productIds.length) {
    await tx.query(
      'INSERT INTO catalog_collection_products (collection_id, product_id, position) SELECT $1, p, ord - 1 FROM unnest($2::uuid[]) WITH ORDINALITY AS t(p, ord)',
      [s.id, s.productIds],
    );
  }
}

export const catalogProjection: EventConsumer = {
  name: 'catalog.read-model',
  target: 'read',
  handles: [...PRODUCT_EVENT_TYPES, ...COLLECTION_EVENT_TYPES],
  async apply(event, tx) {
    if (event.type.startsWith('catalog.Collection')) {
      const s = (event.payload as { snapshot: CollectionSnapshot }).snapshot;
      await projectCollection(tx, s);
      return { invalidate: [catalogTags.collections, catalogTags.collection(s.slug), catalogTags.list, catalogTags.home] };
    }
    const s = (event.payload as { snapshot: ProductSnapshot }).snapshot;
    await projectProduct(tx, s);
    return { invalidate: [catalogTags.product(s.id), catalogTags.list, catalogTags.home, catalogTags.collections] };
  },
};
