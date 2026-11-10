import { Link } from 'react-router';
import { BRAND_NAME } from './brand';
import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <p className={styles.tagline}>
          <span className="serif">Negro</span> como punto de partida.
        </p>
        <nav aria-label="Pie de página" className={styles.links}>
          <Link to="/tienda">Tienda</Link>
          <Link to="/estado">Estado del sistema</Link>
        </nav>
        <p className={styles.copy}>© {new Date().getFullYear()} {BRAND_NAME} · Proyecto de portafolio</p>
      </div>
    </footer>
  );
}
