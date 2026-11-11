import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { useThemeEnhance } from '../../../theme-ui/enhance';
import { ArrowDownIcon } from '../../../theme-ui/icons';
import { cssVars } from '../../../theme-ui/primitives';
import { ProductCard } from '../../../theme-ui/ProductCard';
import { usePageTitle } from '../../../shared/ui/usePageTitle';
import { CollectionFilters } from '../components/CollectionFilters';
import { useCollection, useInfiniteProducts } from '../hooks/useCatalog';
import { useFiltersFromUrl } from '../hooks/useFiltersFromUrl';

const SECTION_SPACING = (top: number) =>
  cssVars({ '--section-spacing-top-desktop': `${top}px`, '--section-spacing-bottom-desktop': '0px', '--section-spacing-top-mobile': `${top}px`, '--section-spacing-bottom-mobile': '0px' });

const BANNER_CONTENT = cssVars({
  '--responsive-content-max-width-desktop': '980px',
  '--content-padding-x-desktop': 1,
  '--content-padding-y-desktop': 1,
  '--responsive-content-max-width-mobile': '800px',
  '--content-padding-x-mobile': 1,
  '--content-padding-y-mobile': 1,
  '--theme-content-align-desktop': 'start',
  '--theme-content-align-mobile': 'start',
  '--collection-banner-item-margin-desktop': '0',
  '--collection-banner-item-margin-mobile': '0',
});

/** `all` es el listado completo del tema (`/collections/all`), no una colección del catálogo. */
const collectionSlug = (slug: string | undefined) => (slug && slug !== 'all' ? slug : undefined);

function GridSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="product-card app-skeleton-card" aria-hidden="true">
          <div className="product-card-image product-card-image--portrait_3_4 app-skeleton" style={cssVars({ '--product-card-image-ratio': '0.7466666666666667' })} />
          <div className="app-skeleton app-skeleton--line" />
        </div>
      ))}
    </>
  );
}

/** Listado de productos con el diseño de colección del tema: `/collections/:slug` y `/search?q=`. */
export function CollectionPage({ mode = 'shop' }: { mode?: 'shop' | 'search' }) {
  const { slug: rawSlug } = useParams();
  const slug = collectionSlug(rawSlug);
  const [search] = useSearchParams();
  const q = mode === 'search' ? (search.get('q') ?? '').trim() : undefined;
  const filters = useFiltersFromUrl({ collection: slug, q });
  const collection = useCollection(slug);
  const { page: _page, ...listParams } = filters.params;
  const { data, isPending, isError, refetch, isPlaceholderData, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteProducts(listParams);
  const [columns, setColumns] = useState(4);

  const first = data?.pages[0];
  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const total = first?.total ?? 0;
  const notFound = !!slug && collection.isError;
  const title = mode === 'search' ? (q ? `Resultados para “${q}”` : 'Buscar') : slug ? (collection.data?.title ?? (notFound ? 'Colección' : '')) : 'Productos';
  usePageTitle(title);

  const grid = useThemeEnhance<HTMLDivElement>([items.length, isPending]);
  const gridVars = cssVars({
    '--collection-columns-desktop': columns,
    '--collection-columns-mobile': 2,
    '--collection-grid-gap-desktop': columns === 4 ? '8px' : '6px',
    '--collection-grid-gap-mobile': '4px',
  });

  return (
    <>
      <section className="shopify-section section-main-collection-banner" style={SECTION_SPACING(16)}>
        <div className="collection-page collection-page--stack-shell collection-page--banner-shell color-scheme-1 section-spacing" style={cssVars({ '--collection-title-color': '#272727' })}>
          <div className="layout-container collection-page__shell collection-page__shell--full-width-gutter layout-container--page layout-container--flush">
            <div className="collection-banner collection-banner--plain collection-banner--heading-position-left collection-banner--heading-position-mobile-left">
              <div className="collection-banner-content responsive-content collection-banner-content--plain" style={BANNER_CONTENT}>
                <h1 className="responsive-heading collection-banner-title type-style type-style--page-title">{title}</h1>
                {collection.data?.description && <p className="collection-banner-description type-style type-style--body">{collection.data.description}</p>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="shopify-section section-collection section-main-collection-product-grid" style={SECTION_SPACING(0)}>
        <div className="collection-page collection-page--stack-shell collection-page--product-grid-shell filter-typography--theme_default color-scheme-1 section-spacing" style={gridVars}>
          <div data-collection-page="" style={gridVars}>
            <div className="layout-container collection-page__body layout-container--page layout-container--flush">
              <div className="collection-main collection-main--no-filters collection-main--filters-dropdown">
                <div className="collection-main__results">
                  {first && <CollectionFilters facets={first.facets} filters={filters} columns={columns} onColumns={setColumns} />}

                  {notFound && (
                    <div className="app-empty">
                      <p>Esa colección no existe o ya no está disponible.</p>
                      <a className="btn-primary" href="/collections/all">
                        Ver todos los productos
                      </a>
                    </div>
                  )}
                  {isError && !data && !notFound && <ErrorState message="No pudimos cargar los productos." onRetry={() => void refetch()} />}
                  {first && items.length === 0 && (
                    <div className="app-empty">
                      <p>{mode === 'search' ? `No encontramos productos para “${q}”.` : 'No encontramos productos con esos filtros.'}</p>
                      {filters.activeCount > 0 && (
                        <button type="button" className="btn-outline" onClick={filters.clear}>
                          Quitar filtros
                        </button>
                      )}
                    </div>
                  )}

                  <div
                    ref={grid}
                    className={`products-grid${isPlaceholderData ? ' is-loading' : ''}`}
                    id="productsGrid"
                    data-reveal-group=""
                    data-reveal-trigger="scroll"
                    data-collection-results-grid=""
                    aria-busy={isPending}
                  >
                    {isPending && <GridSkeleton />}
                    {items.map((p, i) => (
                      <ProductCard key={p.id} product={p} index={i} eager={i < 4} sizes={`(max-width: 767px) calc(100vw / 2), calc(100vw / ${columns})`} />
                    ))}
                  </div>

                  {first && items.length > 0 && (
                    <div className="load-more-section" id="loadMoreSection" aria-busy={isFetchingNextPage}>
                      <div className="load-more-progress">
                        <div className="load-more-fill" style={{ width: `${Math.round((items.length / Math.max(total, 1)) * 100)}%` }} />
                      </div>
                      <p className="load-more-label" role="status" aria-live="polite" aria-atomic="true">
                        Mostrando {items.length} de {total}
                      </p>
                      {hasNextPage && (
                        <button type="button" className="load-more-btn" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
                          {isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
                          <ArrowDownIcon />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
