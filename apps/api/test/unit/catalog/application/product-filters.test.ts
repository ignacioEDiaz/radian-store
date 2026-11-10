import { describe, expect, it } from 'vitest';
import { productListQuerySchema } from '@radian/contracts';
import { cacheKeyFor, normalizeFilters } from '../../../../src/modules/catalog/application/queries/product-filters.js';

const parse = (q: Record<string, unknown>) => productListQuerySchema.parse(q);

describe('product filters', () => {
  it('acepta valores simples o repetidos y aplica defaults', () => {
    expect(parse({ color: 'Black' })).toMatchObject({ color: ['Black'], size: [], sort: 'featured', page: 1 });
    expect(parse({ color: ['Black', 'Oxblood'], available: 'true', page: '2' })).toMatchObject({ color: ['Black', 'Oxblood'], available: true, page: 2 });
  });

  it('rechaza mínimo mayor que máximo y orden desconocido', () => {
    expect(productListQuerySchema.safeParse({ minPrice: '500', maxPrice: '100' }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ sort: 'random' }).success).toBe(false);
  });

  it('la clave de caché es canónica: mismo filtro en distinto orden → misma clave', () => {
    const a = normalizeFilters(parse({ color: ['Oxblood', 'Black'], size: ['m', 'S'], q: ' Boot ' }));
    const b = normalizeFilters(parse({ size: ['S', 'M'], color: ['black', 'oxblood'], q: 'boot' }));
    expect(cacheKeyFor('list', a)).toBe(cacheKeyFor('list', b));
    expect(cacheKeyFor('list', a)).not.toBe(cacheKeyFor('list', normalizeFilters(parse({ color: ['Black'] }))));
  });
});
