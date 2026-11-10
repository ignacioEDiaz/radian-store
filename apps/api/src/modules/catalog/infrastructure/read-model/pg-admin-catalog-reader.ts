import type { AdminCollection, AdminProduct, AdminProductRow, Page, ProductStatus } from '@radian/contracts';
import type { SqlExecutor } from '../../../../shared/infrastructure/db/pool.js';
import type { AdminCatalogReader } from '../../application/ports.js';
import { mediaUrl, defaultWidth, toAdminProduct } from '../../application/views.js';
import type { CollectionImage, ProductSnapshot } from '../../domain/events.js';

/** Lecturas del panel de administración sobre la base de lectura. */
export class PgAdminCatalogReader implements AdminCatalogReader {
  constructor(private readonly readDb: SqlExecutor) {}

  async listProducts(f: { status?: ProductStatus | undefined; q?: string | undefined; page: number; pageSize: number }): Promise<Page<AdminProductRow>> {
    const { rows } = await this.readDb.query<{
      id: string;
      slug: string;
      title: string;
      status: ProductStatus;
      min_price_cents: number;
      image: { mediaId: string; widths: number[] } | null;
      variant_count: number;
      total_stock: number;
      updated_at: Date;
      total: string;
    }>(
      `SELECT p.id, p.slug, p.title, p.status, p.min_price_cents, p.updated_at,
              (SELECT img FROM jsonb_array_elements(p.doc->'images') img ORDER BY (img->>'position')::int LIMIT 1) AS image,
              (SELECT count(*)::int FROM catalog_variants v WHERE v.product_id = p.id) AS variant_count,
              (SELECT COALESCE(sum(v.on_hand), 0)::int FROM catalog_variants v WHERE v.product_id = p.id) AS total_stock,
              count(*) OVER () AS total
         FROM catalog_products p
        WHERE ($1::text IS NULL OR p.status = $1) AND ($2::text IS NULL OR p.search_text LIKE '%' || lower($2) || '%')
        ORDER BY p.updated_at DESC
        LIMIT $3 OFFSET $4`,
      [f.status ?? null, f.q ?? null, f.pageSize, (f.page - 1) * f.pageSize],
    );
    return {
      items: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        status: r.status,
        priceCents: r.min_price_cents,
        imageUrl: r.image ? mediaUrl(r.image.mediaId, Math.min(...r.image.widths)) : null,
        variantCount: r.variant_count,
        totalStock: r.total_stock,
        updatedAt: new Date(r.updated_at).toISOString(),
      })),
      total: Number(rows[0]?.total ?? 0),
      page: f.page,
      pageSize: f.pageSize,
    };
  }

  async getProduct(id: string): Promise<AdminProduct | null> {
    const { rows } = await this.readDb.query<{ doc: ProductSnapshot; stock: { id: string; onHand: number; reserved: number }[] }>(
      `SELECT p.doc,
              COALESCE((SELECT json_agg(json_build_object('id', v.variant_id, 'onHand', v.on_hand, 'reserved', v.reserved)) FROM catalog_variants v WHERE v.product_id = p.id), '[]') AS stock
         FROM catalog_products p WHERE p.id = $1`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    return toAdminProduct(r.doc, new Map(r.stock.map((s) => [s.id, { onHand: s.onHand, reserved: s.reserved }])));
  }

  async listCollections(): Promise<AdminCollection[]> {
    const { rows } = await this.readDb.query<{ id: string; slug: string; title: string; description: string; image: CollectionImage | null; version: number; product_ids: string[] }>(
      `SELECT c.id, c.slug, c.title, c.description, c.image, c.version,
              COALESCE((SELECT array_agg(cp.product_id ORDER BY cp.position) FROM catalog_collection_products cp WHERE cp.collection_id = c.id), '{}') AS product_ids
         FROM catalog_collections c ORDER BY c.title`,
    );
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      description: r.description,
      imageMediaId: r.image?.mediaId ?? null,
      imageUrl: r.image ? mediaUrl(r.image.mediaId, defaultWidth(r.image.widths)) : null,
      productIds: r.product_ids,
      version: r.version,
    }));
  }
}
