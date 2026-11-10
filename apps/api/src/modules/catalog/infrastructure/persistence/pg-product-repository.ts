import { ConflictError } from '../../../../shared/domain/errors.js';
import type { SqlExecutor } from '../../../../shared/infrastructure/db/pool.js';
import { isUniqueViolation } from '../../../../shared/infrastructure/db/pg-errors.js';
import { appendToOutbox } from '../../../../shared/infrastructure/outbox/outbox-writer.js';
import { Product } from '../../domain/product.js';
import type { ProductRepository } from '../../domain/repositories.js';
import type { ImageSnapshot, ProductSnapshot, ProductStatus, VariantSnapshot } from '../../domain/events.js';

interface ProductRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  product_type: string;
  materials: string[];
  tags: string[];
  price_cents: number;
  compare_at_cents: number | null;
  status: ProductStatus;
  featured_rank: number | null;
  published_at: Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  variants: VariantSnapshot[];
  images: ImageSnapshot[];
}

const SELECT = `
  SELECT p.*,
    COALESCE((SELECT json_agg(json_build_object('id', v.id, 'sku', v.sku, 'color', v.color, 'size', v.size,
                'priceCents', v.price_cents, 'position', v.position) ORDER BY v.position)
              FROM product_variants v WHERE v.product_id = p.id), '[]') AS variants,
    COALESCE((SELECT json_agg(json_build_object('id', i.id, 'mediaId', i.media_id, 'alt', i.alt, 'color', i.color,
                'position', i.position, 'width', i.width, 'height', i.height, 'widths', i.widths) ORDER BY i.position)
              FROM product_images i WHERE i.product_id = p.id), '[]') AS images
  FROM products p`;

function toDomain(r: ProductRow): Product {
  const snapshot: ProductSnapshot = {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    productType: r.product_type,
    materials: r.materials,
    tags: r.tags,
    priceCents: r.price_cents,
    compareAtCents: r.compare_at_cents,
    status: r.status,
    featuredRank: r.featured_rank,
    variants: r.variants,
    images: r.images,
    publishedAt: r.published_at,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
  return Product.rehydrate(snapshot);
}

export class PgProductRepository implements ProductRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findById(id: string) {
    const { rows } = await this.db.query<ProductRow>(`${SELECT} WHERE p.id = $1 FOR UPDATE`, [id]);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findBySlug(slug: string) {
    const { rows } = await this.db.query<ProductRow>(`${SELECT} WHERE p.slug = $1`, [slug]);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  /** Persiste el agregado completo (fila + variantes + imágenes) con concurrencia optimista. */
  async save(product: Product): Promise<void> {
    if (!product.hasChanges) return;
    const s = product.toSnapshot();
    const values = [s.id, s.slug, s.title, s.description, s.productType, s.materials, s.tags, s.priceCents, s.compareAtCents, s.status, s.featuredRank, s.publishedAt, s.version, s.createdAt, s.updatedAt];
    try {
      if (product.persistedVersion === 0) {
        await this.db.query(
          `INSERT INTO products (id, slug, title, description, product_type, materials, tags, price_cents, compare_at_cents, status, featured_rank, published_at, version, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          values,
        );
      } else {
        const { rowCount } = await this.db.query(
          `UPDATE products SET slug=$2, title=$3, description=$4, product_type=$5, materials=$6, tags=$7, price_cents=$8, compare_at_cents=$9,
             status=$10, featured_rank=$11, published_at=$12, version=$13, updated_at=$14
           WHERE id=$1 AND version=$15`,
          [s.id, s.slug, s.title, s.description, s.productType, s.materials, s.tags, s.priceCents, s.compareAtCents, s.status, s.featuredRank, s.publishedAt, s.version, s.updatedAt, product.persistedVersion],
        );
        if (rowCount === 0) throw new ConflictError('VERSION_CONFLICT', 'El producto fue modificado por otra persona. Recargá para ver los cambios.');
      }
      await this.syncVariants(s);
      await this.syncImages(s);
    } catch (err) {
      if (isUniqueViolation(err, 'product_variants_sku_key')) throw new ConflictError('SKU_TAKEN', 'Ese SKU ya lo usa otro producto');
      if (isUniqueViolation(err, 'products_slug_key')) throw new ConflictError('SLUG_TAKEN', 'Ese slug ya existe');
      throw err;
    }
    await appendToOutbox(this.db, product.pullEvents());
  }

  private async syncVariants(s: ProductSnapshot) {
    const ids = s.variants.map((v) => v.id);
    await this.db.query('DELETE FROM product_variants WHERE product_id = $1 AND NOT (id = ANY($2::uuid[]))', [s.id, ids]);
    // Primero se liberan SKUs/combinaciones para permitir intercambios dentro del mismo guardado.
    await this.db.query(`UPDATE product_variants SET sku = 'TMP-' || id, color = 'tmp-' || id WHERE product_id = $1`, [s.id]);
    for (const v of s.variants) {
      await this.db.query(
        `INSERT INTO product_variants (id, product_id, sku, color, size, price_cents, position) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET sku=EXCLUDED.sku, color=EXCLUDED.color, size=EXCLUDED.size, price_cents=EXCLUDED.price_cents, position=EXCLUDED.position`,
        [v.id, s.id, v.sku, v.color, v.size, v.priceCents, v.position],
      );
    }
  }

  private async syncImages(s: ProductSnapshot) {
    await this.db.query('DELETE FROM product_images WHERE product_id = $1 AND NOT (id = ANY($2::uuid[]))', [s.id, s.images.map((i) => i.id)]);
    for (const i of s.images) {
      await this.db.query(
        `INSERT INTO product_images (id, product_id, media_id, alt, color, position, width, height, widths) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET alt=EXCLUDED.alt, color=EXCLUDED.color, position=EXCLUDED.position`,
        [i.id, s.id, i.mediaId, i.alt, i.color, i.position, i.width, i.height, i.widths],
      );
    }
  }
}
