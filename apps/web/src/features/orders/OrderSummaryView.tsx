import type { OrderDetail } from '@radian/contracts';
import { formatMoney } from '../../shared/format/money';
import { STATUS_LABEL } from '../checkout/checkoutService';
import styles from './orders.module.css';

const date = (iso: string) => new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });

/** Detalle de un pedido (compartido por confirmación, historial y administración). */
export function OrderSummaryView({ order }: { order: OrderDetail }) {
  const a = order.shippingAddress;
  return (
    <div className={styles.detail}>
      <p>
        Estado:{' '}
        <strong data-status={order.status} className={styles[order.status]}>
          {STATUS_LABEL[order.status]}
        </strong>
        {order.trackingCode && <> · seguimiento {order.trackingCode}</>}
        {order.cancelReason && order.status === 'cancelled' && <span className={styles.muted}> ({order.cancelReason})</span>}
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col">Cant.</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((l) => (
            <tr key={l.variantId}>
              <th scope="row">
                {l.title} <small className={styles.muted}>{l.color} · {l.size}</small>
              </th>
              <td>{l.quantity}</td>
              <td>{formatMoney(l.lineTotalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className={styles.totals}>
        <dt>Subtotal</dt>
        <dd>{formatMoney(order.totals.subtotalCents)}</dd>
        {order.discount && (
          <>
            <dt>Descuento ({order.discount.code})</dt>
            <dd>−{formatMoney(order.discount.amountCents)}</dd>
          </>
        )}
        <dt>Envío ({order.shippingMethod === 'express' ? 'exprés' : 'estándar'})</dt>
        <dd>{order.totals.shippingCents === 0 ? 'Gratis' : formatMoney(order.totals.shippingCents)}</dd>
        <dt>Total</dt>
        <dd>
          <strong>{formatMoney(order.totals.totalCents)}</strong>
        </dd>
      </dl>
      <div className={styles.columns}>
        <div>
          <h3>Envío a</h3>
          <p>
            {a.recipient}
            <br />
            {a.line1}
            {a.line2 ? `, ${a.line2}` : ''}
            <br />
            {a.city}, {a.region} {a.postalCode} · {a.country}
          </p>
        </div>
        <div>
          <h3>Pago</h3>
          <p>{order.payment ? `${order.payment.brand.toUpperCase()} terminada en ${order.payment.last4}` : 'Sin pago confirmado'}</p>
        </div>
        <div>
          <h3>Historial</h3>
          <ol className={styles.history}>
            {order.history.map((h) => (
              <li key={h.status + h.at}>
                {STATUS_LABEL[h.status]} · {date(h.at)}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
