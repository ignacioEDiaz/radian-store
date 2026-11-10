import { Link } from 'react-router';
import styles from '../catalog.module.css';

export function NotFoundPage() {
  return (
    <section className={styles.notFound}>
      <h1>
        No encontramos <span className="serif">lo que buscabas.</span>
      </h1>
      <p>Puede que el producto ya no esté disponible.</p>
      <Link to="/tienda" className="btn">
        Ir a la tienda
      </Link>
    </section>
  );
}
