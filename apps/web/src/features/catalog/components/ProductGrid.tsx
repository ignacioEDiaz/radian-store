import type { ProductCard as Card } from '@radian/contracts';
import { ProductCard } from './ProductCard';
import styles from '../catalog.module.css';

export function ProductGrid({ products, priorityCount = 4 }: { products: Card[]; priorityCount?: number }) {
  return (
    <ul className={styles.grid}>
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className={styles.grid} aria-busy="true" aria-label="Cargando productos">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={styles.skeleton} />
      ))}
    </ul>
  );
}
