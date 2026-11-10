import { createHash } from 'node:crypto';
import type { ProductListQuery, ProductSort } from '@radian/contracts';

/** Filtros canónicos: misma intención → misma clave de caché y mismo SQL. */
export interface NormalizedFilters {
  collection: string | null;
  q: string | null;
  colors: string[];
  sizes: string[];
  materials: string[];
  types: string[];
  minPrice: number | null;
  maxPrice: number | null;
  available: boolean;
  sort: ProductSort;
  page: number;
}

const lowerSorted = (values: string[]) => [...new Set(values.map((v) => v.trim().toLowerCase()))].sort();

export function normalizeFilters(q: ProductListQuery): NormalizedFilters {
  return {
    collection: q.collection?.toLowerCase() || null,
    q: q.q?.trim().toLowerCase() || null,
    colors: lowerSorted(q.color),
    sizes: [...new Set(q.size.map((s) => s.trim().toUpperCase()))].sort(),
    materials: lowerSorted(q.material),
    types: lowerSorted(q.type),
    minPrice: q.minPrice ?? null,
    maxPrice: q.maxPrice ?? null,
    available: q.available ?? false,
    sort: q.sort,
    page: q.page,
  };
}

export function cacheKeyFor(kind: string, value: unknown): string {
  return `catalog:${kind}:${createHash('sha1').update(JSON.stringify(value)).digest('hex')}`;
}
