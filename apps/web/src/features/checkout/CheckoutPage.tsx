import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { placeOrderRequestSchema, type CheckoutQuote, type OrderDetail, type Profile, type ShippingMethod } from '@radian/contracts';
import { ApiError } from '../../shared/api/httpClient';
import { queryKeys } from '../../shared/api/queryKeys';
import { validate, type FieldErrors } from '../../shared/forms/validate';
import { formatMoney } from '../../shared/format/money';
import { TextField } from '../../shared/ui/TextField';
import { useSession } from '../account/hooks/useSession';
import { AddressFields, emptyAddress, toAddressInput, type AddressValues } from '../account/components/AddressFields';
import { emptyCart } from '../cart/hooks/useCart';
import { checkoutService } from './checkoutService';
import styles from './checkout.module.css';

const DECLINE: Record<string, string> = {
  insufficient_funds: 'Fondos insuficientes. Probá con otra tarjeta.',
  card_declined: 'La tarjeta fue rechazada. Probá con otra tarjeta.',
  expired_card: 'La tarjeta está vencida.',
};

export function CheckoutPage() {
  const { profile, isPending } = useSession();
  if (isPending) return <p className={styles.page} aria-busy="true">Cargando…</p>;
  return <CheckoutForm key={profile?.id ?? 'guest'} profile={profile} />;
}

function CheckoutForm({ profile }: { profile: Profile | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(profile?.email ?? '');
  const [address, setAddress] = useState<AddressValues>(() =>
    profile?.defaultAddress ? { ...emptyAddress, ...profile.defaultAddress, line2: profile.defaultAddress.line2 ?? '' } : { ...emptyAddress, recipient: profile?.name ?? '' },
  );
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>('standard');
  const [codeInput, setCodeInput] = useState('');
  const [discountCode, setDiscountCode] = useState<string | undefined>();
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '', holder: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  // Una clave por intento de compra: reintentos/doble clic con la misma clave = un solo pedido.
  const idempotencyKey = useRef(crypto.randomUUID());
  const submitting = useRef(false);

  const quoteInput = { shippingMethod, discountCode, email: email || undefined };
  const quote = useQuery({ queryKey: queryKeys.checkout.quote(quoteInput), queryFn: () => checkoutService.quote(quoteInput), placeholderData: (prev) => prev, retry: false });

  const place = useMutation({
    mutationFn: (body: Parameters<typeof checkoutService.placeOrder>[0]) => checkoutService.placeOrder(body, idempotencyKey.current),
    onSuccess: (order: OrderDetail) => {
      queryClient.setQueryData(queryKeys.orders.detail(order.number), order);
      // Pedido pagado ⇒ el backend vacía el carrito por política (asíncrona); la UI lo refleja ya,
      // sin esperar la proyección (un refetch inmediato podría traer el snapshot anterior).
      if (order.status === 'paid') queryClient.setQueryData(queryKeys.cart, emptyCart);
      void navigate(`/pedidos/${order.number}`, { replace: true });
    },
    onError: (err) => {
      // Respuesta definitiva: el próximo intento es una compra nueva.
      if (err instanceof ApiError && err.code !== 'REQUEST_IN_PROGRESS') idempotencyKey.current = crypto.randomUUID();
      if (err instanceof ApiError && err.code === 'PRICE_CHANGED') void quote.refetch();
      if (err instanceof ApiError && err.status === 400) setErrors(err.fieldErrors);
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  if (quote.error instanceof ApiError && quote.error.code === 'EMPTY_CART') {
    return (
      <section className={styles.page}>
        <h1>Checkout</h1>
        <p>Tu carrito está vacío.</p>
        <Link to="/collections/all" className="btn">
          Ir a la tienda
        </Link>
      </section>
    );
  }

  const q: CheckoutQuote | undefined = quote.data;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current || !q) return;
    const [mm, yy] = card.expiry.split('/').map((s) => s.trim());
    const body = {
      email,
      shippingAddress: toAddressInput(address),
      shippingMethod,
      ...(discountCode ? { discountCode } : {}),
      card: { number: card.number, expMonth: Number(mm), expYear: 2000 + Number(yy), cvc: card.cvc, holder: card.holder },
      expectedTotalCents: q.totals.totalCents,
    };
    const result = validate(placeOrderRequestSchema, body);
    setErrors(result.errors ?? {});
    if (!result.data) return;
    submitting.current = true;
    place.mutate(body);
  }

  const apiError = place.error instanceof ApiError ? place.error : null;
  const errorMessage =
    apiError?.code === 'PAYMENT_DECLINED'
      ? (DECLINE[String(apiError.problem?.meta?.['reason'])] ?? apiError.message)
      : apiError?.code === 'PRICE_CHANGED'
        ? 'El total cambió desde que lo viste. Revisá el resumen y volvé a confirmar.'
        : apiError && apiError.status !== 400
          ? apiError.message
          : null;

  return (
    <form className={styles.layout} onSubmit={onSubmit} noValidate aria-labelledby="checkout-title">
      <div className={styles.main}>
        <h1 id="checkout-title">Checkout</h1>
        {errorMessage && (
          <div role="alert" className={styles.alert}>
            {errorMessage}
            {apiError?.code === 'INSUFFICIENT_STOCK' && <p>Revisá tu carrito: algunas unidades ya no están disponibles.</p>}
          </div>
        )}

        <fieldset className={styles.section}>
          <legend>Contacto</legend>
          <TextField label="Email" type="email" autoComplete="email" value={email} error={errors['email']} onChange={setEmail} readOnly={!!profile} />
          {!profile && (
            <p className={styles.muted}>
              ¿Tenés cuenta? <Link to="/cuenta/ingresar?redirect=/checkout">Ingresá</Link> para guardar el pedido en tu historial.
            </p>
          )}
        </fieldset>

        <fieldset className={styles.section}>
          <legend>Dirección de envío</legend>
          <AddressFields values={address} onChange={setAddress} errors={errors} prefix="shippingAddress" />
        </fieldset>

        <fieldset className={styles.section}>
          <legend>Envío</legend>
          {(q?.shippingOptions ?? []).map((o) => (
            <label key={o.method} className={styles.radio}>
              <input type="radio" name="shipping" value={o.method} checked={shippingMethod === o.method} onChange={() => setShippingMethod(o.method)} />
              <span>{o.label}</span>
              <strong>{o.priceCents === 0 ? 'Gratis' : formatMoney(o.priceCents)}</strong>
            </label>
          ))}
        </fieldset>

        <fieldset className={styles.section}>
          <legend>Pago</legend>
          <p className={styles.muted}>Pago simulado. Tarjeta de prueba aprobada: 4242 4242 4242 4242 · rechazada: 4000 0000 0000 0002.</p>
          <TextField label="Número de tarjeta" inputMode="numeric" autoComplete="cc-number" value={card.number} error={errors['card.number']} onChange={(number) => setCard((c) => ({ ...c, number }))} />
          <div className={styles.row}>
            <TextField label="Vencimiento (MM/AA)" autoComplete="cc-exp" placeholder="12/30" value={card.expiry} error={errors['card.expMonth'] ?? errors['card.expYear']} onChange={(expiry) => setCard((c) => ({ ...c, expiry }))} />
            <TextField label="CVC" inputMode="numeric" autoComplete="cc-csc" value={card.cvc} error={errors['card.cvc']} onChange={(cvc) => setCard((c) => ({ ...c, cvc }))} />
          </div>
          <TextField label="Titular" autoComplete="cc-name" value={card.holder} error={errors['card.holder']} onChange={(holder) => setCard((c) => ({ ...c, holder }))} />
        </fieldset>
      </div>

      <aside className={styles.summary} aria-labelledby="summary-title">
        <h2 id="summary-title">Resumen</h2>
        {quote.isPending && <p aria-busy="true">Calculando…</p>}
        {q && (
          <>
            <ul className={styles.lines}>
              {q.lines.map((l) => (
                <li key={l.variantId}>
                  <span>
                    {l.title} <small>{l.color} · {l.size} × {l.quantity}</small>
                    {l.warnings.length > 0 && <small className={styles.warning}> Sin stock suficiente</small>}
                  </span>
                  <span>{formatMoney(l.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
            <div className={styles.discount}>
              <label htmlFor="discount-code">Código de descuento</label>
              <div className={styles.row}>
                <input id="discount-code" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} />
                <button type="button" className="btn btn--ghost" onClick={() => setDiscountCode(codeInput.trim() || undefined)}>
                  Aplicar
                </button>
              </div>
              {q.discountError && <p className="field-error">{q.discountError}</p>}
            </div>
            <dl className={styles.totals}>
              <dt>Subtotal</dt>
              <dd>{formatMoney(q.totals.subtotalCents)}</dd>
              {q.discount && (
                <>
                  <dt>Descuento ({q.discount.code})</dt>
                  <dd>−{formatMoney(q.discount.amountCents)}</dd>
                </>
              )}
              <dt>Envío</dt>
              <dd>{q.totals.shippingCents === 0 ? 'Gratis' : formatMoney(q.totals.shippingCents)}</dd>
              <dt className={styles.total}>Total</dt>
              <dd className={styles.total}>{formatMoney(q.totals.totalCents)}</dd>
            </dl>
            <button type="submit" className="btn btn--accent btn--block" disabled={place.isPending}>
              {place.isPending ? 'Procesando pago…' : `Pagar ${formatMoney(q.totals.totalCents)}`}
            </button>
          </>
        )}
      </aside>
    </form>
  );
}
