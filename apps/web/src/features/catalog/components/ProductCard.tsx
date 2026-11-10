import { useId } from 'react';
import { Link } from 'react-router';
import type { ProductCard as Card } from '@radian/contracts';
import { ResponsiveImage } from './ResponsiveImage';
import { PriceTag } from './PriceTag';
import styles from '../catalog.module.css';

const SIZES = '(min-width: 1200px) 25vw, (min-width: 768px) 33vw, 50vw';

export function ProductCard({ product, priority = false }: { product: Card; priority?: boolean }) {
  const titleId = useId();
  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <Link to={`/productos/${product.slug}`} className={styles.cardMedia} tabIndex={-1} aria-hidden="true">
        {product.image ? <ResponsiveImage image={product.image} sizes={SIZES} priority={priority} alt="" /> : <div className={styles.placeholder} />}
        {product.hoverImage && <ResponsiveImage image={product.hoverImage} sizes={SIZES} className={styles.hover} alt="" />}
        <span className={styles.badges}>
          {product.isNew && <span className={styles.badge}>Nuevo</span>}
          {!product.available && <span className={`${styles.badge} ${styles.soldOut}`}>Agotado</span>}
          {product.compareAtCents && product.available && <span className={`${styles.badge} ${styles.sale}`}>Oferta</span>}
        </span>
      </Link>
      <h3 id={titleId} className={styles.cardTitle}>
        <Link to={`/productos/${product.slug}`}>{product.title}</Link>
      </h3>
      <PriceTag priceCents={product.priceCents} compareAtCents={product.compareAtCents} />
      {product.colors.length > 1 && <p className={styles.colorsHint}>{product.colors.length} colores</p>}
    </article>
  );
}
