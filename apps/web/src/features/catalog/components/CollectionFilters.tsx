import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SORTS, type Facets, type FacetValue } from '@radian/contracts';
import { CheckIcon, ChevronIcon, FilterIcon, SortIcon } from '../../../theme-ui/icons';
import { cssVars, swatchColor } from '../../../theme-ui/primitives';
import type { Dimension, useFiltersFromUrl } from '../hooks/useFiltersFromUrl';

type Filters = ReturnType<typeof useFiltersFromUrl>;

export const SORT_LABEL: Record<(typeof SORTS)[number], string> = {
  featured: 'Destacados',
  best_selling: 'Más vendidos',
  newest: 'Novedades',
  price_asc: 'Precio: menor a mayor',
  price_desc: 'Precio: mayor a menor',
};

interface DropdownProps {
  label: string;
  /** Cantidad de valores elegidos en este grupo (se muestra junto al título). */
  selected?: number;
  open: boolean;
  onToggle: () => void;
  onReset?: (() => void) | undefined;
  className?: string;
  header?: ReactNode;
  role?: 'group' | 'listbox';
  children: ReactNode;
}

/** Desplegable de la barra de filtros del tema (botón + panel). */
function Dropdown({ label, selected = 0, open, onToggle, onReset, className = 'filter-group--native', header, role = 'group', children }: DropdownProps) {
  const id = useId();
  return (
    <div className={`filter-group filter-group--dropdown ${className}${open ? ' is-open' : ''}`} data-filter-dropdown="">
      <button
        type="button"
        className={`filter-group-header${header ? ' sort-control sort-control--inline toolbar-pill' : ''}`}
        id={`${id}-trigger`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
      >
        {header ?? (
          <span className="filter-group-label">
            {label}
            {selected > 0 && <span aria-live="polite"> ({selected})</span>}
          </span>
        )}
        <span className={`filter-chevron${header ? ' sort-control__chevron' : ''}`} aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>
      <div className="filter-group-body filter-group-body--dropdown" id={`${id}-panel`} role={role} aria-labelledby={`${id}-trigger`} data-lenis-prevent="" hidden={!open}>
        <div className="filter-group-inner">
          <p className="filter-dropdown-title type-style type-style--subheading">{label}</p>
          {children}
        </div>
        {onReset && (
          <div className="filter-dropdown-actions">
            <button type="button" className="filter-dropdown-actions__reset" onClick={onReset} disabled={selected === 0}>
              Restablecer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckItem({ label, count, checked, disabled, onChange }: { label: string; count?: number; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <label className={`filter-check-item${disabled ? ' is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      <span className="filter-check-box">
        <CheckIcon />
      </span>
      <span className="filter-check-label">{label}</span>
      {count !== undefined && <span className="filter-check-count">{count}</span>}
    </label>
  );
}

const toCents = (value: string) => (/^\d+([.,]\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value.replace(',', '.')) * 100) : undefined);

function PriceRange({ facets, filters }: { facets: Facets; filters: Filters }) {
  const { minPrice, maxPrice } = filters.params;
  const [min, setMin] = useState(minPrice === undefined ? '' : String(minPrice / 100));
  const [max, setMax] = useState(maxPrice === undefined ? '' : String(maxPrice / 100));
  const apply = () => filters.setPrice(toCents(min), toCents(max));
  const ceiling = Math.ceil(facets.price.max / 100);
  return (
    <form
      className="price-range-inputs"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <label htmlFor="filter-price-min" className="visually-hidden">
        Precio mínimo
      </label>
      <span className="price-field" data-currency-symbol="US$">
        <span className="price-field__symbol" aria-hidden="true">
          US$
        </span>
        <input className="price-input" type="number" id="filter-price-min" inputMode="decimal" placeholder="0" min={0} max={ceiling} value={min} onChange={(e) => setMin(e.target.value)} onBlur={apply} />
      </span>
      <label htmlFor="filter-price-max" className="visually-hidden">
        Precio máximo
      </label>
      <span className="price-field" data-currency-symbol="US$">
        <span className="price-field__symbol" aria-hidden="true">
          US$
        </span>
        <input className="price-input" type="number" id="filter-price-max" inputMode="decimal" placeholder={String(ceiling)} min={0} max={ceiling} value={max} onChange={(e) => setMax(e.target.value)} onBlur={apply} />
      </span>
      <button type="submit" className="visually-hidden">
        Aplicar precio
      </button>
    </form>
  );
}

const usable = (values: FacetValue[], isActive: (v: string) => boolean) => values.filter((f) => f.count > 0 || isActive(f.value));

interface Props {
  facets: Facets;
  filters: Filters;
  /** En una colección el tipo de producto no suma: ya está acotado. */
  columns: number;
  onColumns: (n: number) => void;
}

/**
 * Barra de filtros y orden con el markup del tema. Los conteos los calcula la API (excluyendo el
 * propio filtro) y el estado vive en la URL, así que cada combinación se puede compartir.
 */
export function CollectionFilters({ facets, filters, columns, onColumns }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = (name: string) => setOpen((current) => (current === name ? null : name));

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const { params } = filters;
  const sort = (params.sort ?? 'featured') as (typeof SORTS)[number];
  const group = (dim: Dimension, label: string, values: FacetValue[], render: (f: FacetValue) => ReactNode, wrap?: (items: ReactNode) => ReactNode) => {
    const items = usable(values, (v) => filters.isActive(dim, v));
    if (items.length === 0) return null;
    const rendered = items.map(render);
    return (
      <Dropdown key={dim} label={label} selected={params[dim].length} open={open === dim} onToggle={() => toggle(dim)} onReset={() => filters.clearDimension(dim)}>
        {wrap ? wrap(rendered) : rendered}
      </Dropdown>
    );
  };

  return (
    <div className={`collection-controls collection-controls--dropdown${mobileOpen ? ' is-mobile-open' : ''}`} ref={root}>
      <div className="filter-dropdowns" data-filter-dropdowns="">
        <Dropdown label="Disponibilidad" selected={params.available ? 1 : 0} open={open === 'available'} onToggle={() => toggle('available')} onReset={() => filters.setAvailable(false)}>
          <CheckItem label="En stock" checked={!!params.available} onChange={() => filters.setAvailable(!params.available)} />
        </Dropdown>
        <Dropdown
          label="Precio"
          selected={params.minPrice !== undefined || params.maxPrice !== undefined ? 1 : 0}
          open={open === 'price'}
          onToggle={() => toggle('price')}
          onReset={() => filters.setPrice(undefined, undefined)}
        >
          <PriceRange key={`${params.minPrice}-${params.maxPrice}`} facets={facets} filters={filters} />
        </Dropdown>
        {group(
          'color',
          'Color',
          facets.colors,
          (f) => (
            <div key={f.value} className="color-filter-item color-filter-item--vertical_list" title={f.value}>
              <input id={`filter-color-${f.value}`} type="checkbox" checked={filters.isActive('color', f.value)} onChange={() => filters.toggle('color', f.value)} />
              <label className="color-filter-item__control" htmlFor={`filter-color-${f.value}`}>
                <span className="color-dot" style={{ ...cssVars({ '--swatch-bg': swatchColor(f.value) }), backgroundColor: 'var(--swatch-bg)' }} aria-hidden="true" />
                <span className="color-filter-label">{f.value}</span>
                <span className="filter-check-count">{f.count}</span>
              </label>
            </div>
          ),
          (items) => <div className="color-filter-items color-filter-items--vertical_list">{items}</div>,
        )}
        {group(
          'size',
          'Talle',
          facets.sizes,
          (f) => (
            <label key={f.value} className="size-chip size-chip--filter">
              <input type="checkbox" aria-label={`Talle ${f.value}`} checked={filters.isActive('size', f.value)} onChange={() => filters.toggle('size', f.value)} />
              <span>{f.value}</span>
            </label>
          ),
          (items) => <div className="size-chips size-chips--filter">{items}</div>,
        )}
        {group('type', 'Tipo de producto', facets.types, (f) => (
          <CheckItem key={f.value} label={f.value} count={f.count} checked={filters.isActive('type', f.value)} onChange={() => filters.toggle('type', f.value)} />
        ))}
        {group('material', 'Material', facets.materials, (f) => (
          <CheckItem key={f.value} label={f.value} count={f.count} checked={filters.isActive('material', f.value)} onChange={() => filters.toggle('material', f.value)} />
        ))}
      </div>

      <div className="toolbar toolbar--layout-dropdown" id="collectionToolbar">
        <div className="collection-mobile-toolbar">
          <button type="button" className="collection-mobile-toolbar__filter" aria-expanded={mobileOpen} onClick={() => setMobileOpen((v) => !v)}>
            <span aria-hidden="true">
              <FilterIcon />
            </span>
            <span>Filtros y orden</span>
            <span className={`filter-count-badge${filters.activeCount === 0 ? ' is-hidden' : ''}`}>{filters.activeCount}</span>
          </button>
        </div>
        <div className="toolbar-inner">
          <div className="toolbar-left">
            <div className={`active-filters${filters.activeCount === 0 ? ' is-hidden' : ''}`} id="activeFiltersRow">
              <span className="active-filter-label">Filtros activos: {filters.activeCount}</span>
              <button type="button" className="clear-all-link" onClick={filters.clear}>
                Quitar todos los filtros
              </button>
            </div>
          </div>
          <div className="toolbar-right toolbar-right--with-sort">
            <div className="sort-form">
              <Dropdown
                label="Ordenar por"
                className="filter-group--sort-dropdown"
                role="listbox"
                open={open === 'sort'}
                onToggle={() => toggle('sort')}
                header={
                  <>
                    <span className="toolbar-pill__icon" aria-hidden="true">
                      <SortIcon />
                    </span>
                    <span className="sort-control__text">
                      <span className="sort-control__label">Ordenar por</span>
                      <span className="sort-control__value">{SORT_LABEL[sort]}</span>
                    </span>
                  </>
                }
              >
                <div className="sort-dropdown__options">
                  {SORTS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="option"
                      aria-selected={value === sort}
                      className={`sort-dropdown__option${value === sort ? ' is-active' : ''}`}
                      onClick={() => {
                        filters.setSort(value);
                        setOpen(null);
                      }}
                    >
                      <span>{SORT_LABEL[value]}</span>
                      <span className="sort-dropdown__check" aria-hidden="true">
                        <CheckIcon size={10} />
                      </span>
                    </button>
                  ))}
                </div>
              </Dropdown>
            </div>
            <div className="collection-view-by collection-view-by--desktop" role="group" aria-label="Columnas">
              <span className="collection-view-by__label">Ver de a</span>
              {[4, 6, 8].map((n) => (
                <button key={n} type="button" className={`collection-view-by__option${columns === n ? ' is-active' : ''}`} aria-pressed={columns === n} onClick={() => onColumns(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
