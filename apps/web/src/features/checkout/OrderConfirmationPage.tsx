import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderDetail } from '@radian/contracts';
import { queryKeys } from '../../shared/api/queryKeys';
import { useSession } from '../account/hooks/useSession';
import { OrderSummaryView } from '../orders/OrderSummaryView';
import { ordersService } from './checkoutService';
import styles from './checkout.module.css';

/** Confirmación: usa la respuesta del comando (cache) y, con sesión, puede recargarse desde la API. */
export function OrderConfirmationPage() {
  const { number = '' } = useParams();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useSession();
  const cached = queryClient.getQueryData<OrderDetail>(queryKeys.orders.detail(number));
  const { data } = useQuery({
    queryKey: queryKeys.orders.detail(number),
    queryFn: () => ordersService.getMine(number),
    enabled: !cached && isAuthenticated,
    ...(cached ? { initialData: cached } : {}),
  });
  const order = data ?? cached;

  return (
    <section className={styles.page} aria-labelledby="thanks-title">
      <h1 id="thanks-title">{order?.status === 'pending_payment' ? 'Estamos confirmando tu pago' : '¡Gracias por tu compra!'}</h1>
      <p>
        Pedido <strong>{number}</strong>
        {order && <> · te enviamos el detalle a {order.email}</>}
      </p>
      {order?.status === 'pending_payment' && (
        <p className={styles.muted}>El proveedor de pagos demoró la respuesta. Reservamos tus productos por 15 minutos; vas a ver el estado final en tu historial.</p>
      )}
      {order && <OrderSummaryView order={order} />}
      <p>
        <Link to="/tienda" className="btn btn--ghost">
          Seguir comprando
        </Link>{' '}
        {isAuthenticated && (
          <Link to="/cuenta/pedidos" className="btn">
            Ver mis pedidos
          </Link>
        )}
      </p>
    </section>
  );
}
