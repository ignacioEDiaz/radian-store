import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../shared/api/queryKeys';
import { formatMoney } from '../../shared/format/money';
import { ErrorState } from '../../shared/ui/ErrorState';
import { STATUS_LABEL, ordersService } from '../checkout/checkoutService';
import styles from './orders.module.css';

export function OrdersPage() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.orders.mine(1),
    queryFn: () => ordersService.listMine(1),
  });
  return (
    <section className={styles.page} aria-labelledby="orders-title">
      <p>
        <Link to="/cuenta">← Mi cuenta</Link>
      </p>
      <h1 id="orders-title">Mis pedidos</h1>
      {isPending && <p aria-busy="true">Cargando…</p>}
      {isError && (
        <ErrorState message="No pudimos cargar tus pedidos." onRetry={() => void refetch()} />
      )}
      {data && data.items.length === 0 && (
        <p>
          Todavía no hiciste compras. <Link to="/tienda">Ir a la tienda</Link>
        </p>
      )}
      {data && data.items.length > 0 && (
        <div className="table-scroll">
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Pedido</th>
                <th scope="col">Fecha</th>
                <th scope="col">Estado</th>
                <th scope="col">Productos</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((o) => (
                <tr key={o.id}>
                  <th scope="row">
                    <Link to={`/cuenta/pedidos/${o.number}`}>{o.number}</Link>
                  </th>
                  <td>{new Date(o.placedAt).toLocaleDateString('es-AR')}</td>
                  <td className={styles[o.status]}>{STATUS_LABEL[o.status]}</td>
                  <td>{o.itemCount}</td>
                  <td>{formatMoney(o.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
