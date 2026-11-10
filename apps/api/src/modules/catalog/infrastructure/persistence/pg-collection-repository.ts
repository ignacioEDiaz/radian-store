import { ConflictError } from '../../../../shared/domain/errors.js';
import type { SqlExecutor } from '../../../../shared/infrastructure/db/pool.js';
import { appendToOutbox } from '../../../../shared/infrastructure/outbox/outbox-writer.js';
import { Collection } from '../../domain/collection.js';
import type { CollectionImage } from '../../domain/events.js';
import type { CollectionRepository } from '../../domain/repositories.js';

interface Row {
  id: string;
  slug: string;
  title: string;
  description: string;
  image: CollectionImage | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  product_ids: string[];
}

const SELECT = `SELECT c.*, COALESCE((SELECT array_agg(cp.product_id ORDER BY cp.position) FROM collection_products cp WHERE cp.collection_id = c.id), '{}') AS product_ids FROM collections c`;

const toDomain = (r: Row) =>
  Collection.rehydrate({ id: r.id, slug: r.slug, title: r.title, description: r.description, image: r.image, productIds: r.product_ids, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at });

export class PgCollectionRepository implements CollectionRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findById(id: string) {
    const { rows } = await this.db.query<Row>(`${SELECT} WHERE c.id = $1`, [id]);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findBySlug(slug: string) {
    const { rows } = await this.db.query<Row>(`${SELECT} WHERE c.slug = $1`, [slug]);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findContaining(productId: string) {
    const { rows } = await this.db.query<Row>(`${SELECT} WHERE EXISTS (SELECT 1 FROM collection_products x WHERE x.collection_id = c.id AND x.product_id = $1)`, [productId]);
    return rows.map(toDomain);
  }

  async save(c: Collection): Promise<void> {
    if (!c.hasChanges) return;
    const s = c.toSnapshot();
    const image = s.image ? JSON.stringify(s.image) : null;
    if (c.persistedVersion === 0) {
      await this.db.query(
        'INSERT INTO collections (id, slug, title, description, image, version, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [s.id, s.slug, s.title, s.description, image, s.version, s.createdAt, s.updatedAt],
      );
    } else {
      const { rowCount } = await this.db.query(
        'UPDATE collections SET title=$2, description=$3, image=$4, version=$5, updated_at=$6 WHERE id=$1 AND version=$7',
        [s.id, s.title, s.description, image, s.version, s.updatedAt, c.persistedVersion],
      );
      if (rowCount === 0) throw new ConflictError('VERSION_CONFLICT', 'La colección fue modificada por otra persona');
    }
    await this.db.query('DELETE FROM collection_products WHERE collection_id = $1', [s.id]);
    if (s.productIds.length) {
      await this.db.query(
        'INSERT INTO collection_products (collection_id, product_id, position) SELECT $1, p, ord - 1 FROM unnest($2::uuid[]) WITH ORDINALITY AS t(p, ord)',
        [s.id, s.productIds],
      );
    }
    await appendToOutbox(this.db, c.pullEvents());
  }
}
