import type { SqlExecutor } from '../../../../shared/infrastructure/db/pool.js';
import type { SlugAllocator } from '../../domain/repositories.js';
import type { Slug } from '../../domain/slug.js';

/** Elige `base`, `base-2`, `base-3`… según los slugs existentes. El índice único es la garantía final. */
export class PgSlugAllocator implements SlugAllocator {
  constructor(private readonly db: SqlExecutor) {}

  async allocate(kind: 'product' | 'collection', base: Slug): Promise<Slug> {
    const table = kind === 'product' ? 'products' : 'collections';
    const { rows } = await this.db.query<{ slug: string }>(`SELECT slug FROM ${table} WHERE slug = $1 OR slug LIKE $1 || '-%'`, [base.value]);
    const taken = new Set(rows.map((r) => r.slug));
    if (!taken.has(base.value)) return base;
    for (let n = 2; ; n += 1) {
      const candidate = base.withSuffix(n);
      if (!taken.has(candidate.value)) return candidate;
    }
  }
}
