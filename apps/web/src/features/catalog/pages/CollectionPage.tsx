import { useParams, useSearchParams } from 'react-router';
import { SORTS } from '@radian/contracts';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { useCollection, useProducts } from '../hooks/useCatalog';
import { useFiltersFromUrl } from '../hooks/useFiltersFromUrl';
import { FiltersPanel } from '../components/FiltersPanel';
import { GridSkeleton, ProductGrid } from '../components/ProductGrid';
import { Pagination } from '../components/Pagination';
import styles from '../catalog.module.css';

const SORT_LABEL: Record<(typeof SORTS)[number], string> = {
  featured: 'Destacados',
  newest: 'Novedades',
  price_asc: 'Precio: menor a mayor',
  price_desc: 'Precio: mayor a menor',
  best_selling: 'Más vendidos',
};

/** Listado de productos: `/tienda`, `/colecciones/:slug` y `/buscar?q=` (mode="search"). */
export function CollectionPage({ mode = 'shop' }: { mode?: 'shop' | 'search' }) {
  const { slug } = useParams();
  const [search] = useSearchParams();
  const q = mode === 'search' ? (search.get('q') ?? '') : undefined;
  const filters = useFiltersFromUrl({ collection: slug, q });
  const collection = useCollection(slug);
  const { data, isPending, isError, refetch, isPlaceholderData } = useProducts(filters.params);

  const title = mode === 'search' ? `Resultados para “${q}”` : (collection.data?.title ?? (slug ? '' : 'Tienda'));

  return (
    <div className={styles.listing}>
      <header className={styles.listingHead}>
        <h1>{title}</h1>
        {collection.data?.description && <p className={styles.lead}>{collection.data.description}</p>}
        <div className={styles.listingBar}>
          <p aria-live="polite">{data ? (data.total === 1 ? '1 producto' : `${data.total} productos`) : ''}</p>
          <div className={styles.sort}>
            <label htmlFor="sort">Ordenar por</label>
            <select id="sort" value={filters.params.sort ?? 'featured'} onChange={(e) => filters.setSort(e.target.value)}>
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>
      <div className={styles.listingBody}>
        {data && (
          <FiltersPanel
            facets={data.facets}
            isActive={filters.isActive}
            onToggle={filters.toggle}
            available={!!filters.params.available}
            onAvailable={filters.setAvailable}
            onClear={filters.clear}
          />
        )}
        <div className={isPlaceholderData ? styles.stale : undefined}>
          {isError && !data && <ErrorState message="No pudimos cargar los productos." onRetry={() => void refetch()} />}
          {isPending && <GridSkeleton />}
          {data && data.items.length === 0 && (
            <div className={styles.empty}>
              <p>No encontramos productos con esos filtros.</p>
              <button type="button" className="btn btn--ghost" onClick={filters.clear}>
                Limpiar filtros
              </button>
            </div>
          )}
          {data && data.items.length > 0 && <ProductGrid products={data.items} />}
          {data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} href={filters.pageHref} />}
        </div>
      </div>
    </div>
  );
}
