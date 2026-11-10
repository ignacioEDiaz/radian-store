import { Link, NavLink } from 'react-router';
import { BRAND_NAME } from './brand';
import { useLogout, useSession } from '../features/account/hooks/useSession';
import styles from './Header.module.css';

export function Header() {
  const { profile, isAdmin } = useSession();
  const logout = useLogout();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <nav aria-label="Navegación principal" className={styles.nav}>
          <NavLink to="/tienda">Tienda</NavLink>
        </nav>
        <Link to="/" className={styles.logo} aria-label={`${BRAND_NAME} — inicio`}>
          {BRAND_NAME.toUpperCase()}
        </Link>
        <div className={styles.actions}>
          {isAdmin && (
            <Link to="/admin" className={styles.action}>
              Admin
            </Link>
          )}
          {profile ? (
            <>
              <Link to="/cuenta" className={styles.action}>
                {profile.name.split(' ')[0]}
              </Link>
              <button type="button" className={styles.linkButton} onClick={() => logout.mutate()}>
                Salir
              </button>
            </>
          ) : (
            <Link to="/cuenta/ingresar" className={styles.action}>
              Ingresar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
