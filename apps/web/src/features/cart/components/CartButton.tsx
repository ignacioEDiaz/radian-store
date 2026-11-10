import { useCart } from '../hooks/useCart';
import { useCartDrawer } from './CartDrawerContext';
import styles from '../cart.module.css';

export function CartButton() {
  const { data } = useCart();
  const { open } = useCartDrawer();
  const count = data?.itemCount ?? 0;
  return (
    <button type="button" className={styles.cartButton} onClick={open} aria-label={`Carrito, ${count} ${count === 1 ? 'producto' : 'productos'}`}>
      Bolsa <span className={styles.count}>{count}</span>
    </button>
  );
}
