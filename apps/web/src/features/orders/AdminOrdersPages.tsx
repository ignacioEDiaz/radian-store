import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ORDER_STATUSES, type OrderDetail, type OrderStatus } from '@radian/contracts';
import { queryKeys } from '../../shared/api/queryKeys';
import { formatMoney } from '../../shared/format/money';
import { ErrorState } from '../../shared/ui/ErrorState';
import { STATUS_LABEL, ordersService } from '../checkout/checkoutService';
import { OrderSummaryView } from './OrderSummaryView';
import styles from './orders.module.css';

export function AdminOrdersPage() {
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const filter = { status: status || undefined };
  const { data, isError, refetch } = useQuery({
    queryKey: queryKeys.orders.admin(filter),
    queryFn: () => ordersService.listAdmin(filter.status),
    placeholderData: keepPreviousData,
  });
  return (
    <section className={styles.page} aria-labelledby="admin-orders-title">
      <div className={styles.toolbar}>
        <h1 id="admin-orders-title">Pedidos</h1>
        <div className="field">
          <label htmlFor="order-status">Estado</label>
          <select
            id="order-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as OrderStatus | '')}
          >
            <option value="">Todos</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {isError && (
        <ErrorState message="No se pudieron cargar los pedidos" onRetry={() => void refetch()} />
      )}
      {data && (
        <div className="table-scroll">
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Pedido</th>
                <th scope="col">Cliente</th>
                <th scope="col">Fecha</th>
                <th scope="col">Estado</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((o) => (
                <tr key={o.id}>
                  <th scope="row">
                    <Link to={`/admin/pedidos/${o.number}`}>{o.number}</Link>
                  </th>
                  <td>{o.email}</td>
                  <td>{new Date(o.placedAt).toLocaleString('es-AR')}</td>
                  <td className={styles[o.status]}>{STATUS_LABEL[o.status]}</td>
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

export function AdminOrderDetailPage() {
  const { number = '' } = useParams();
  const queryClient = useQueryClient();
  const {
    data: order,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.orders.adminDetail(number),
    queryFn: () => ordersService.getAdmin(number),
  });
  const [tracking, setTracking] = useState('');
  const [reason, setReason] = useState('');
  const onDone = (o: OrderDetail) => {
    queryClient.setQueryData(queryKeys.orders.adminDetail(number), o);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
  };
  const ship = useMutation({
    mutationFn: () => ordersService.ship(number, order!.version, tracking),
    onSuccess: onDone,
  });
  const cancel = useMutation({
    mutationFn: () => ordersService.cancel(number, order!.version, reason),
    onSuccess: onDone,
  });

  if (isPending)
    return (
      <p className={styles.page} aria-busy="true">
        Cargando…
      </p>
    );
  if (isError || !order)
    return (
      <div className={styles.page}>
        <ErrorState message="No se pudo cargar el pedido" onRetry={() => void refetch()} />
      </div>
    );

  const submit = (fn: () => void) => (e: FormEvent) => {
    e.preventDefault();
    fn();
  };
  const error = ship.error ?? cancel.error;

  return (
    <section className={styles.page} aria-labelledby="admin-order-title">
      <p>
        <Link to="/admin/pedidos">← Pedidos</Link>
      </p>
      <h1 id="admin-order-title">
        Pedido {order.number} <small className={styles.muted}>{order.email}</small>
      </h1>
      {error && (
        <p role="alert" className="field-error">
          {error.message}
        </p>
      )}
      <OrderSummaryView order={order} />
      <div className={styles.actions}>
        {order.status === 'paid' && (
          <form onSubmit={submit(() => ship.mutate())} className={styles.inline}>
            <div className="field">
              <label htmlFor="tracking">Código de seguimiento</label>
              <input
                id="tracking"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                required
                minLength={3}
              />
            </div>
            <button
              type="submit"
              className="btn"
              disabled={ship.isPending || tracking.trim().length < 3}
            >
              Marcar como enviado
            </button>
          </form>
        )}
        {(order.status === 'paid' || order.status === 'pending_payment') && (
          <form onSubmit={submit(() => cancel.mutate())} className={styles.inline}>
            <div className="field">
              <label htmlFor="cancel-reason">Motivo de cancelación</label>
              <input
                id="cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                minLength={3}
              />
            </div>
            <button
              type="submit"
              className="btn btn--ghost"
              disabled={cancel.isPending || reason.trim().length < 3}
            >
              Cancelar pedido{order.status === 'paid' ? ' y reintegrar' : ''}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
