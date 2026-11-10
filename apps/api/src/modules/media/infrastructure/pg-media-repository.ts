import { ConflictError } from '../../../shared/domain/errors.js';
import type { SqlExecutor } from '../../../shared/infrastructure/db/pool.js';
import { isUniqueViolation } from '../../../shared/infrastructure/db/pg-errors.js';
import { appendToOutbox } from '../../../shared/infrastructure/outbox/outbox-writer.js';
import { MediaAsset, type MediaRepository } from '../domain/media-asset.js';

interface Row {
  id: string;
  sha256: string;
  mime_type: string;
  width: number;
  height: number;
  bytes: number;
  widths: number[];
  created_at: Date;
}

const toDomain = (r: Row) =>
  MediaAsset.rehydrate({ id: r.id, sha256: r.sha256, mimeType: r.mime_type, width: r.width, height: r.height, bytes: r.bytes, widths: r.widths, createdAt: r.created_at });

export class PgMediaRepository implements MediaRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findById(id: string) {
    const { rows } = await this.db.query<Row>('SELECT * FROM media_assets WHERE id = $1', [id]);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findBySha256(sha256: string) {
    const { rows } = await this.db.query<Row>('SELECT * FROM media_assets WHERE sha256 = $1', [sha256]);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async save(asset: MediaAsset): Promise<void> {
    const s = asset.toSnapshot();
    try {
      await this.db.query(
        'INSERT INTO media_assets (id, sha256, mime_type, width, height, bytes, widths, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [s.id, s.sha256, s.mimeType, s.width, s.height, s.bytes, s.widths, s.createdAt],
      );
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('MEDIA_EXISTS', 'La imagen ya existe');
      throw err;
    }
    await appendToOutbox(this.db, asset.pullEvents());
  }
}

/** Adaptador para el puerto `MediaLookup` de catalog. */
export class PgMediaLookup {
  constructor(private readonly db: SqlExecutor) {}

  async find(mediaId: string) {
    const asset = await new PgMediaRepository(this.db).findById(mediaId);
    if (!asset) return null;
    const s = asset.toSnapshot();
    return { id: s.id, width: s.width, height: s.height, widths: s.widths };
  }
}
