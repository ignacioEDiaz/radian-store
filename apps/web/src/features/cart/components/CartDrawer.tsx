import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import type { CartLineView } from '@radian/contracts';
import { formatMoney } from '../../../shared/format/money';
import { ResponsiveImage } from '../../catalog/components/ResponsiveImage';
import { useCart, useRemoveCartLine, useUpdateCartLine } from '../hooks/useCart';
import { useCartDrawer } from './CartDrawerContext';
import styles from '../cart.module.css';

const WARNING: Record<string, string> = {
  PRICE_CHANGED: 'El precio cambió desde que lo agregaste.',
  OUT_OF_STOCK: 'Sin stock: no se incluye en el total.',
  QUANTITY_REDUCED: 'Hay menos unidades disponibles; ajustamos la cantidad.',
  UNAVAILABLE: 'Este producto ya no está disponible.',
};

/** Panel lateral del carrito (diálogo modal accesible, cierra con Escape). */
export function CartDrawer() {
  const { isOpen, close } = useCartDrawer();
  const { data: cart } = useCart();
  const update = useUpdateCartLine();
  const remove = useRemoveCartLine();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  if (!isOpen) return null;
  const error = update.error ?? remove.error;

  return (
    <div className={styles.overlay} onClick={close}>
      <aside role="dialog" aria-modal="true" aria-label="Tu carrito" className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <header className={styles.drawerHead}>
          <h2>Tu carrito</h2>
          <button ref={closeRef} type="button" className={styles.close} onClick={close} aria-label="Cerrar carrito">
            ×
          </button>
        </header>
        {error && (
          <p role="alert" className={styles.error}>
            {error.message}
          </p>
        )}
        {!cart || cart.lines.length === 0 ? (
          <div className={styles.empty}>
            <p>Tu carrito está vacío.</p>
            <Link to="/tienda" className="btn btn--ghost" onClick={close}>
              Seguir comprando
            </Link>
          </div>
        ) : (
          <>
            <ul className={styles.lines}>
              {cart.lines.map((l) => (
                <CartLineItem key={l.lineId} line={l} onQuantity={(quantity) => update.mutate({ lineId: l.lineId, quantity })} onRemove={() => remove.mutate(l.lineId)} />
              ))}
            </ul>
            <footer className={styles.drawerFoot}>
              <p className={styles.subtotal}>
                <span>Subtotal</span> <strong>{formatMoney(cart.subtotalCents)}</strong>
              </p>
              <p className={styles.muted}>Envío y descuentos se calculan en el checkout.</p>
              <Link to="/checkout" className="btn btn--accent btn--block" onClick={close}>
                Finalizar compra
              </Link>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}

function CartLineItem({ line, onQuantity, onRemove }: { line: CartLineView; onQuantity: (q: number) => void; onRemove: () => void }) {
  const pending = line.lineId.startsWith('pending-');
  return (
    <li className={`${styles.line} ${line.available ? '' : styles.unavailable}`}>
      <div className={styles.thumb}>{line.image && <ResponsiveImage image={line.image} sizes="96px" alt="" />}</div>
      <div className={styles.lineBody}>
        <Link to={`/productos/${line.productSlug}`} className={styles.lineTitle}>
          {line.title}
        </Link>
        <p className={styles.muted}>
          {line.color} · {line.size}
        </p>
        {line.warnings.map((w) => (
          <p key={w} className={styles.warning}>
            {WARNING[w] ?? w}
            {w === 'PRICE_CHANGED' && line.previousUnitPriceCents !== null && <> (antes {formatMoney(line.previousUnitPriceCents)})</>}
          </p>
        ))}
        <div className={styles.lineActions}>
          {line.available && (
            <div className={styles.stepper} role="group" aria-label={`Cantidad de ${line.title}`}>
              <button type="button" onClick={() => onQuantity(line.quantity - 1)} disabled={pending || line.quantity <= 1} aria-label="Restar una unidad">
                −
              </button>
              <span aria-live="polite">{line.quantity}</span>
              <button type="button" onClick={() => onQuantity(line.quantity + 1)} disabled={pending || line.quantity >= line.maxQuantity} aria-label="Sumar una unidad">
                +
              </button>
            </div>
          )}
          <button type="button" className={styles.remove} onClick={onRemove} disabled={pending} aria-label={`Quitar ${line.title}`}>
            Quitar
          </button>
        </div>
      </div>
      <p className={styles.lineTotal}>{formatMoney(line.lineTotalCents)}</p>
    </li>
  );
}
