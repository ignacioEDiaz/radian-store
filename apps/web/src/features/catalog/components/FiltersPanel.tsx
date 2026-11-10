import type { Facets } from '@radian/contracts';
import type { Dimension } from '../hooks/useFiltersFromUrl';
import styles from '../catalog.module.css';

interface Props {
  facets: Facets;
  isActive: (dim: Dimension, value: string) => boolean;
  onToggle: (dim: Dimension, value: string) => void;
  available: boolean;
  onAvailable: (on: boolean) => void;
  onClear: () => void;
  hideTypes?: boolean;
}

const GROUPS: { dim: Dimension; key: keyof Omit<Facets, 'price'>; label: string }[] = [
  { dim: 'size', key: 'sizes', label: 'Talle' },
  { dim: 'color', key: 'colors', label: 'Color' },
  { dim: 'type', key: 'types', label: 'Tipo' },
  { dim: 'material', key: 'materials', label: 'Material' },
];

/** Facetas con conteos (calculados por la API excluyendo el propio filtro). */
export function FiltersPanel({ facets, isActive, onToggle, available, onAvailable, onClear, hideTypes }: Props) {
  return (
    <aside className={styles.filters} aria-label="Filtros">
      <label className={styles.check}>
        <input type="checkbox" checked={available} onChange={(e) => onAvailable(e.target.checked)} />
        Solo disponibles
      </label>
      {GROUPS.filter((g) => !(hideTypes && g.dim === 'type')).map((g) =>
        facets[g.key].length === 0 ? null : (
          <fieldset key={g.dim} className={styles.facet}>
            <legend>{g.label}</legend>
            {facets[g.key].map((f) => (
              <label key={f.value} className={styles.check}>
                <input type="checkbox" checked={isActive(g.dim, f.value)} onChange={() => onToggle(g.dim, f.value)} disabled={f.count === 0 && !isActive(g.dim, f.value)} />
                {f.value} ({f.count})
              </label>
            ))}
          </fieldset>
        ),
      )}
      <button type="button" className="btn btn--ghost btn--block" onClick={onClear}>
        Limpiar filtros
      </button>
    </aside>
  );
}
