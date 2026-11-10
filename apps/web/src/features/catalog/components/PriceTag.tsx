import { formatMoney } from '../../../shared/format/money';
import styles from '../catalog.module.css';

export function PriceTag({ priceCents, compareAtCents, large = false }: { priceCents: number; compareAtCents: number | null; large?: boolean }) {
  return (
    <p className={`${styles.price} ${large ? styles.priceLarge : ''}`}>
      {compareAtCents ? (
        <>
          <span className="visually-hidden">Precio de oferta: </span>
          <span className={styles.salePrice}>{formatMoney(priceCents)}</span>{' '}
          <span className="visually-hidden">Precio anterior: </span>
          <s className={styles.compare}>{formatMoney(compareAtCents)}</s>
        </>
      ) : (
        formatMoney(priceCents)
      )}
    </p>
  );
}
