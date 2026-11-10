import { Outlet } from 'react-router';
import { Header } from './Header';
import { Footer } from './Footer';
import { CartDrawerProvider } from '../features/cart/components/CartDrawerContext';
import { CartDrawer } from '../features/cart/components/CartDrawer';
import styles from './Layout.module.css';

export function Layout() {
  return (
    <CartDrawerProvider>
      <div className={styles.shell}>
        <a className={styles.skip} href="#main">
          Ir al contenido
        </a>
        <Header />
        <main id="main" className={styles.main}>
          <Outlet />
        </main>
        <Footer />
        <CartDrawer />
      </div>
    </CartDrawerProvider>
  );
}
