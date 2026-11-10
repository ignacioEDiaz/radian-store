import { Link, NavLink } from 'react-router';
import { BRAND_NAME } from './brand';
import styles from './Header.module.css';

export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <nav aria-label="Navegación principal" className={styles.nav}>
          <NavLink to="/tienda">Tienda</NavLink>
        </nav>
        <Link to="/" className={styles.logo} aria-label={`${BRAND_NAME} — inicio`}>
          {BRAND_NAME.toUpperCase()}
        </Link>
        <div className={styles.actions} />
      </div>
    </header>
  );
}
