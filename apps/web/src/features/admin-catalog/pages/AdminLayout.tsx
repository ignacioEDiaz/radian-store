import { NavLink, Outlet } from 'react-router';
import { RequireAdmin } from '../../account/components/guards';
import styles from '../admin.module.css';

export function AdminLayout() {
  return (
    <RequireAdmin>
      <nav aria-label="Administración" className={styles.nav}>
        <NavLink to="/admin/productos">Productos</NavLink>
        <NavLink to="/admin/colecciones">Colecciones</NavLink>
        <NavLink to="/admin/pedidos">Pedidos</NavLink>
        <NavLink to="/estado">Estado del sistema</NavLink>
      </nav>
      <Outlet />
    </RequireAdmin>
  );
}
