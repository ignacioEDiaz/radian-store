import { Link } from 'react-router';
import { FREE_SHIPPING_THRESHOLD_CENTS, type CartLineView, type CartWarning } from '@radian/contracts';
import { formatMoney } from '../../shared/format/money';
import { ErrorState } from '../../shared/ui/ErrorState';
import { usePageTitle } from '../../shared/ui/usePageTitle';
import { useCart, useRemoveCartLine, useUpdateCartLine } from './hooks/useCart';
import styles from './cart.module.css';

const WARNINGS: Record<CartWarning, string> = {
  PRICE_CHANGED: 'El precio cambió desde que lo agregaste.',
  OUT_OF_STOCK: 'Sin stock: quitalo para poder finalizar la compra.',
  QUANTITY_REDUCED: 'Ajustamos la cantidad al stock disponible.',
  UNAVAILABLE: 'Este producto ya no está disponible.',
};

function Line({ line }: { line: CartLineView }) {
  const update = useUpdateCartLine();
  const remove = useRemoveCartLine();
  const name = `${line.title} - ${line.color} / ${line.size}`;
  const url = `/products/${line.productSlug}`;
  return (
    <li className={styles.line} aria-busy={update.isPending || remove.isPending}>
      <Link to={url} className={styles.thumb} aria-hidden="true" tabIndex={-1}>
        {line.image && <img src={line.image.url} alt="" width={line.image.width} height={line.image.height} loading="lazy" />}
      </Link>
      <div className={styles.info}>
        <Link to={url} className={styles.title}>
          {line.title}
        </Link>
        <p className={styles.variant}>
          Color: {line.color} · Talle: {line.size}
        </p>
        <p className={styles.unit}>{formatMoney(line.unitPriceCents)}</p>
        {line.warnings.map((w) => (
          <p key={w} className={styles.warning} role="status">
            {WARNINGS[w]}
          </p>
        ))}
        {update.isError && (
          <p className={styles.warning} role="alert">
            {update.error.message}
          </p>
        )}
      </div>
      <div className={styles.qty} role="group" aria-label={`Cantidad de ${name}`}>
        <button type="button" aria-label={`Restar una unidad de ${name}`} disabled={line.quantity <= 1} onClick={() => update.mutate({ lineId: line.lineId, quantity: line.quantity - 1 })}>
          −
        </button>
        <span aria-live="polite">{line.quantity}</span>
        <button
          type="button"
          aria-label={`Sumar una unidad de ${name}`}
          disabled={line.quantity >= line.maxQuantity || !line.available}
          onClick={() => update.mutate({ lineId: line.lineId, quantity: line.quantity + 1 })}
        >
          +
        </button>
      </div>
      <p className={styles.total}>{formatMoney(line.lineTotalCents)}</p>
      <button type="button" className={styles.remove} aria-label={`Quitar ${name}`} onClick={() => remove.mutate(line.lineId)}>
        Quitar
      </button>
    </li>
  );
}

/** Página del carrito (`/cart`): mismas operaciones que el drawer, con actualización optimista. */
export function CartPage() {
  usePageTitle('Tu bolsa');
  const { data: cart, isPending, isError, refetch } = useCart();

  if (isPending) return <div className="app-page--loading" aria-busy="true" aria-label="Cargando carrito" />;
  if (isError || !cart) return <ErrorState message="No pudimos cargar tu carrito." onRetry={() => void refetch()} />;

  if (cart.lines.length === 0) {
    return (
      <section className="app-empty">
        <h1>Tu bolsa</h1>
        <p>Tu carrito está vacío.</p>
        <Link to="/collections/all" className="btn">
          Seguir comprando
        </Link>
      </section>
    );
  }

  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD_CENTS - cart.subtotalCents);
  const blocked = cart.lines.some((l) => !l.available);
  return (
    <section className={styles.page}>
      <h1>
        Tu bolsa <span className={styles.count}>({cart.itemCount})</span>
      </h1>
      <div className={styles.layout}>
        <ul className={styles.lines} aria-label="Productos en tu bolsa">
          {cart.lines.map((line) => (
            <Line key={line.lineId} line={line} />
          ))}
        </ul>
        <aside className={styles.summary} aria-label="Resumen">
          <p className={styles.shipping}>{remaining === 0 ? '¡Tenés envío gratis!' : `Sumá ${formatMoney(remaining)} y el envío es gratis.`}</p>
          <div className={styles.subtotal}>
            <span>Subtotal</span>
            <strong>{formatMoney(cart.subtotalCents)}</strong>
          </div>
          <p className={styles.note}>El envío y los descuentos se calculan al finalizar la compra.</p>
          {blocked ? (
            <p className={styles.warning} role="alert">
              Quitá los productos sin stock para continuar.
            </p>
          ) : (
            <Link to="/checkout" className="btn btn--block">
              Finalizar compra
            </Link>
          )}
          <Link to="/collections/all" className={styles.continue}>
            Seguir comprando
          </Link>
        </aside>
      </div>
    </section>
  );
}
