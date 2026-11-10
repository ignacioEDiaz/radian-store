import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../shared/api/httpClient';
import { queryKeys } from '../../shared/api/queryKeys';
import { ErrorState } from '../../shared/ui/ErrorState';
import { ordersService } from '../checkout/checkoutService';
import { OrderSummaryView } from './OrderSummaryView';
import styles from './orders.module.css';

export function OrderDetailPage() {
  const { number = '' } = useParams();
  const { data, isPending, error, refetch } = useQuery({ queryKey: queryKeys.orders.detail(number), queryFn: () => ordersService.getMine(number) });
  return (
    <section className={styles.page} aria-labelledby="order-title">
      <p>
        <Link to="/cuenta/pedidos">← Mis pedidos</Link>
      </p>
      <h1 id="order-title">Pedido {number}</h1>
      {isPending && <p aria-busy="true">Cargando…</p>}
      {error && (error instanceof ApiError && error.status === 404 ? <p>No encontramos ese pedido.</p> : <ErrorState message="No pudimos cargar el pedido." onRetry={() => void refetch()} />)}
      {data && <OrderSummaryView order={data} />}
    </section>
  );
}
