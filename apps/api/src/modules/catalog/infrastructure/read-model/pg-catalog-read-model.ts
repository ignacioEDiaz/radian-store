import type { CollectionView, FacetValue, Home, ImageView, ProductCard, ProductDetail, ProductList, Suggestions, VariantView } from '@radian/contracts';
import { PAGE_SIZE } from '@radian/contracts';
import type { SqlExecutor } from '../../../../shared/infrastructure/db/pool.js';
import type { NormalizedFilters } from '../../application/queries/product-filters.js';
import type { CatalogReadModel } from '../../application/queries/storefront-queries.js';
import type { ImageSnapshot, ProductSnapshot } from '../../domain/events.js';

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
const sizeRank = (s: string) => (SIZE_ORDER.includes(s) ? SIZE_ORDER.indexOf(s) : 100);
const NEW_DAYS = 30;
/** Umbral de similitud para tolerar errores de tipeo ("leathr" → leather). */
const TYPO = 0.45;

type ImageLike = Pick<ImageSnapshot, 'mediaId' | 'width' | 'height' | 'widths'> & { alt?: string; color?: string | null };

export function toImageView(img: ImageLike, alt: string, preferred = 640): ImageView {
  const widths = [...img.widths].sort((a, b) => a - b);
  const width = widths.find((w) => w >= preferred) ?? widths[widths.length - 1]!;
  const url = (w: number) => `/media/${img.mediaId}/${w}.webp`;
  return { url: url(width), srcset: widths.map((w) => ({ width: w, url: url(w) })), alt: img.alt || alt, width: img.width, height: img.height, color: img.color ?? null };
}

interface CardRow {
  id: string;
  slug: string;
  title: string;
  product_type: string;
  min_price_cents: number;
  compare_at_cents: number | null;
  colors: string[];
  available: boolean;
  published_at: Date | null;
  images: ImageSnapshot[] | null;
}

const CARD_COLUMNS = `p.id, p.slug, p.title, p.product_type, p.min_price_cents, p.compare_at_cents, p.colors, p.available, p.published_at, p.doc->'images' AS images`;

function toCard(r: CardRow, now = Date.now()): ProductCard {
  const images = [...(r.images ?? [])].sort((a, b) => a.position - b.position);
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    productType: r.product_type,
    priceCents: r.min_price_cents,
    compareAtCents: r.compare_at_cents,
    image: images[0] ? toImageView(images[0], r.title) : null,
    hoverImage: images[1] ? toImageView(images[1], r.title) : null,
    colors: r.colors,
    available: r.available,
    isNew: r.published_at !== null && now - new Date(r.published_at).getTime() < NEW_DAYS * 86_400_000,
  };
}

type Dimension = 'color' | 'size' | 'material' | 'type' | 'price';

/** Construye el WHERE de productos publicados; `exclude` omite una dimensión (facetas). */
function whereFor(f: NormalizedFilters, exclude?: Dimension) {
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where = [`p.status = 'published'`];
  if (f.collection) {
    where.push(`EXISTS (SELECT 1 FROM catalog_collection_products cp JOIN catalog_collections c ON c.id = cp.collection_id WHERE cp.product_id = p.id AND c.slug = ${p(f.collection)})`);
  }
  if (f.q) {
    const q = p(f.q);
    where.push(`(p.search_tsv @@ websearch_to_tsquery('simple', ${q}) OR word_similarity(${q}, p.search_text) > ${TYPO})`);
  }
  const colors = exclude === 'color' ? [] : f.colors;
  const sizes = exclude === 'size' ? [] : f.sizes;
  if (colors.length || sizes.length || f.available) {
    where.push(
      `EXISTS (SELECT 1 FROM catalog_variants v WHERE v.product_id = p.id` +
        (colors.length ? ` AND lower(v.color) = ANY(${p(colors)}::text[])` : '') +
        (sizes.length ? ` AND upper(v.size) = ANY(${p(sizes)}::text[])` : '') +
        (f.available ? ' AND v.available_qty > 0' : '') +
        ')',
    );
  }
  if (exclude !== 'material' && f.materials.length) where.push(`EXISTS (SELECT 1 FROM unnest(p.materials) m WHERE lower(m) = ANY(${p(f.materials)}::text[]))`);
  if (exclude !== 'type' && f.types.length) where.push(`lower(p.product_type) = ANY(${p(f.types)}::text[])`);
  if (exclude !== 'price' && f.minPrice !== null) where.push(`p.min_price_cents >= ${p(f.minPrice)}`);
  if (exclude !== 'price' && f.maxPrice !== null) where.push(`p.min_price_cents <= ${p(f.maxPrice)}`);
  return { sql: where.join(' AND '), params, p };
}

export class PgCatalogReadModel implements CatalogReadModel {
  constructor(private readonly db: SqlExecutor) {}

  async listProducts(f: NormalizedFilters): Promise<ProductList> {
    const w = whereFor(f);
    let order: string;
    if (f.sort === 'featured' && f.q) {
      const q = w.p(f.q);
      order = `ts_rank(p.search_tsv, websearch_to_tsquery('simple', ${q})) + word_similarity(${q}, p.search_text) DESC, p.featured_rank NULLS LAST`;
    } else if (f.sort === 'featured' && f.collection) {
      order = `(SELECT cp.position FROM catalog_collection_products cp JOIN catalog_collections c ON c.id = cp.collection_id WHERE cp.product_id = p.id AND c.slug = ${w.p(f.collection)}) NULLS LAST`;
    } else {
      order = {
        featured: 'p.featured_rank NULLS LAST, p.published_at DESC',
        newest: 'p.published_at DESC',
        price_asc: 'p.min_price_cents ASC',
        price_desc: 'p.min_price_cents DESC',
        best_selling: 'p.sales_count DESC, p.featured_rank NULLS LAST',
      }[f.sort];
    }
    const limit = w.p(PAGE_SIZE);
    const offset = w.p((f.page - 1) * PAGE_SIZE);
    const [items, total, facets] = await Promise.all([
      this.db.query<CardRow>(`SELECT ${CARD_COLUMNS} FROM catalog_products p WHERE ${w.sql} ORDER BY ${order}, p.title, p.id LIMIT ${limit} OFFSET ${offset}`, w.params),
      (() => {
        const c = whereFor(f);
        return this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM catalog_products p WHERE ${c.sql}`, c.params);
      })(),
      this.facets(f),
    ]);
    return { items: items.rows.map((r) => toCard(r)), total: total.rows[0]?.n ?? 0, page: f.page, pageSize: PAGE_SIZE, facets };
  }

  private async facets(f: NormalizedFilters): Promise<ProductList['facets']> {
    const group = async (dim: Dimension, select: string, from: string, groupBy: string) => {
      const w = whereFor(f, dim);
      const { rows } = await this.db.query<FacetValue>(`SELECT ${select} AS value, count(DISTINCT p.id)::int AS count FROM catalog_products p ${from} WHERE ${w.sql} GROUP BY ${groupBy}`, w.params);
      return rows;
    };
    const variantFrom = f.available ? 'JOIN catalog_variants v ON v.product_id = p.id AND v.available_qty > 0' : 'JOIN catalog_variants v ON v.product_id = p.id';
    const [colors, sizes, materials, types, price] = await Promise.all([
      group('color', 'v.color', variantFrom, 'v.color'),
      group('size', 'v.size', variantFrom, 'v.size'),
      group('material', 'm', 'CROSS JOIN LATERAL unnest(p.materials) m', 'm'),
      group('type', 'p.product_type', '', 'p.product_type'),
      (async () => {
        const w = whereFor(f, 'price');
        const { rows } = await this.db.query<{ min: number | null; max: number | null }>(
          `SELECT min(p.min_price_cents)::int AS min, max(p.min_price_cents)::int AS max FROM catalog_products p WHERE ${w.sql}`,
          w.params,
        );
        return { min: rows[0]?.min ?? 0, max: rows[0]?.max ?? 0 };
      })(),
    ]);
    const byName = (a: FacetValue, b: FacetValue) => a.value.localeCompare(b.value);
    return {
      colors: colors.sort(byName),
      sizes: sizes.sort((a, b) => sizeRank(a.value) - sizeRank(b.value) || byName(a, b)),
      materials: materials.sort(byName),
      types: types.sort(byName),
      price,
    };
  }

  async getProduct(slug: string): Promise<ProductDetail | null> {
    const { rows } = await this.db.query<CardRow & { doc: ProductSnapshot }>(`SELECT ${CARD_COLUMNS}, p.doc FROM catalog_products p WHERE p.slug = $1 AND p.status = 'published'`, [slug]);
    const row = rows[0];
    if (!row) return null;
    const [variants, related] = await Promise.all([
      this.db.query<{ variant_id: string; sku: string; color: string; size: string; price_cents: number; available_qty: number }>(
        'SELECT variant_id, sku, color, size, price_cents, available_qty FROM catalog_variants WHERE product_id = $1 ORDER BY position',
        [row.id],
      ),
      this.db.query<CardRow>(
        `SELECT ${CARD_COLUMNS} FROM catalog_products p
          WHERE p.status = 'published' AND p.available AND p.id <> $1
            AND (p.product_type = $2 OR EXISTS (
              SELECT 1 FROM catalog_collection_products a JOIN catalog_collection_products b ON a.collection_id = b.collection_id
               WHERE a.product_id = $1 AND b.product_id = p.id))
          ORDER BY p.featured_rank NULLS LAST, p.published_at DESC LIMIT 8`,
        [row.id, row.product_type],
      ),
    ]);
    const vs: VariantView[] = variants.rows.map((v) => ({
      id: v.variant_id,
      sku: v.sku,
      color: v.color,
      size: v.size,
      priceCents: v.price_cents,
      available: v.available_qty > 0,
      availableQty: Math.min(v.available_qty, 10),
    }));
    const images = [...row.doc.images].sort((a, b) => a.position - b.position);
    return {
      ...toCard(row),
      priceCents: row.doc.priceCents,
      description: row.doc.description,
      materials: row.doc.materials,
      images: images.map((i) => toImageView(i, row.title, 960)),
      variants: vs,
      options: {
        colors: [...new Set(vs.map((v) => v.color))],
        sizes: [...new Set(vs.map((v) => v.size))].sort((a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b)),
      },
      related: related.rows.map((r) => toCard(r)),
    };
  }

  private async collections(where = 'TRUE', params: unknown[] = []): Promise<CollectionView[]> {
    const { rows } = await this.db.query<{ id: string; slug: string; title: string; description: string; image: ImageLike | null; first_image: ImageLike | null; product_count: number }>(
      `SELECT c.id, c.slug, c.title, c.description, c.image,
              (SELECT (SELECT img FROM jsonb_array_elements(p.doc->'images') img ORDER BY (img->>'position')::int LIMIT 1)
                 FROM catalog_collection_products cp JOIN catalog_products p ON p.id = cp.product_id AND p.status = 'published'
                WHERE cp.collection_id = c.id ORDER BY cp.position LIMIT 1) AS first_image,
              (SELECT count(*)::int FROM catalog_collection_products cp JOIN catalog_products p ON p.id = cp.product_id AND p.status = 'published'
                WHERE cp.collection_id = c.id) AS product_count
         FROM catalog_collections c WHERE ${where} ORDER BY c.title`,
      params,
    );
    return rows
      .filter((r) => r.product_count > 0)
      .map((r) => {
        const img = r.image ?? r.first_image;
        return { id: r.id, slug: r.slug, title: r.title, description: r.description, image: img ? toImageView(img, r.title, 960) : null, productCount: r.product_count };
      });
  }

  listCollections() {
    return this.collections();
  }

  async getCollection(slug: string) {
    return (await this.collections('c.slug = $1', [slug]))[0] ?? null;
  }

  async suggestions(q: string): Promise<Suggestions> {
    const [products, collections] = await Promise.all([
      this.db.query<CardRow>(
        `SELECT ${CARD_COLUMNS} FROM catalog_products p
          WHERE p.status = 'published'
            AND (p.search_tsv @@ websearch_to_tsquery('simple', $1) OR word_similarity($1, p.search_text) > 0.3 OR lower(p.title) LIKE '%' || $1 || '%')
          ORDER BY greatest(similarity(lower(p.title), $1), word_similarity($1, p.search_text)) DESC, p.featured_rank NULLS LAST
          LIMIT 6`,
        [q],
      ),
      this.collections(`(lower(c.title) LIKE '%' || $1 || '%' OR word_similarity($1, lower(c.title)) > 0.4)`, [q]),
    ]);
    return { products: products.rows.map((r) => toCard(r)), collections: collections.slice(0, 3) };
  }

  async home(): Promise<Home> {
    const cards = (order: string) =>
      this.db.query<CardRow>(`SELECT ${CARD_COLUMNS} FROM catalog_products p WHERE p.status = 'published' ORDER BY ${order}, p.id LIMIT 8`);
    const [collections, newest, best] = await Promise.all([
      this.collections(),
      cards('p.published_at DESC'),
      cards('p.sales_count DESC, p.featured_rank NULLS LAST'),
    ]);
    return {
      featuredCollections: [...collections].sort((a, b) => b.productCount - a.productCount).slice(0, 4),
      newArrivals: newest.rows.map((r) => toCard(r)),
      bestSellers: best.rows.map((r) => toCard(r)),
    };
  }
}
