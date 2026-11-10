import { Outlet } from 'react-router';
import { Header } from './Header';
import { Footer } from './Footer';
import styles from './Layout.module.css';

export function Layout() {
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">
        Ir al contenido
      </a>
      <Header />
      <main id="main" className={styles.main}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
