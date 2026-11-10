import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { ListParams } from '../services/catalogService';

export type Dimension = 'color' | 'size' | 'material' | 'type';

const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

/**
 * La URL es la fuente de verdad de filtros, orden y página: compartible y recargable.
 * Cambiar un filtro vuelve a la página 1.
 */
export function useFiltersFromUrl(fixed: { collection?: string | undefined; q?: string | undefined } = {}) {
  const [search, setSearch] = useSearchParams();

  const params: ListParams = useMemo(
    () => ({
      collection: fixed.collection,
      q: fixed.q ?? (search.get('q') || undefined),
      color: search.getAll('color'),
      size: search.getAll('size'),
      material: search.getAll('material'),
      type: search.getAll('type'),
      minPrice: num(search.get('minPrice')),
      maxPrice: num(search.get('maxPrice')),
      available: search.get('available') === 'true' || undefined,
      sort: search.get('sort') ?? undefined,
      page: num(search.get('page')) ?? 1,
    }),
    [search, fixed.collection, fixed.q],
  );

  const update = (mutate: (s: URLSearchParams) => void) => {
    const next = new URLSearchParams(search);
    mutate(next);
    setSearch(next, { preventScrollReset: true });
  };

  return {
    params,
    isActive: (dim: Dimension, value: string) => params[dim].includes(value),
    toggle: (dim: Dimension, value: string) =>
      update((s) => {
        const values = s.getAll(dim);
        s.delete(dim);
        (values.includes(value) ? values.filter((v) => v !== value) : [...values, value]).forEach((v) => s.append(dim, v));
        s.delete('page');
      }),
    setSort: (sort: string) =>
      update((s) => {
        if (sort === 'featured') s.delete('sort');
        else s.set('sort', sort);
        s.delete('page');
      }),
    setAvailable: (on: boolean) =>
      update((s) => {
        if (on) s.set('available', 'true');
        else s.delete('available');
        s.delete('page');
      }),
    clear: () => update((s) => ['color', 'size', 'material', 'type', 'minPrice', 'maxPrice', 'available', 'page'].forEach((k) => s.delete(k))),
    /** href relativo para la página `n` conservando el resto de los parámetros. */
    pageHref: (n: number) => {
      const s = new URLSearchParams(search);
      if (n <= 1) s.delete('page');
      else s.set('page', String(n));
      const qs = s.toString();
      return qs ? `?${qs}` : '?';
    },
  };
}
