import { NavLink, Outlet } from 'react-router';
import { RequireAdmin } from '../../account/components/guards';
import { useSession } from '../../account/hooks/useSession';
import styles from '../admin.module.css';

export function AdminLayout() {
  const { isReadOnly } = useSession();
  return (
    <RequireAdmin>
      {isReadOnly && (
        <p role="note" className={styles.readOnlyBanner}>
          <strong>Modo solo lectura.</strong> Estás usando una cuenta de demostración: podés recorrer todo el panel, pero los cambios
          están deshabilitados para proteger los datos de la tienda.
        </p>
      )}
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
