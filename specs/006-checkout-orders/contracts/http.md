# HTTP Contracts: Checkout y pedidos

Esquemas en `packages/contracts/src/ordering.ts`.

```ts
Totals = { subtotalCents, discountCents, shippingCents, totalCents, currency: 'USD' }
CheckoutQuote = { lines: CartLineView[], shippingOptions: { method, label, priceCents }[],
  discount: { code, amountCents } | null, discountError: string | null, totals: Totals }
Card = { number, expMonth, expYear, cvc, holder }        // solo viaja; nunca se persiste
OrderDetail = { id, number, status, email, lines: OrderLineView[], shippingAddress: Address,
  shippingMethod, discount: {code, amountCents}|null, totals: Totals,
  payment: { brand, last4, status } | null, trackingCode: string|null,
  history: { status, at }[], placedAt }
OrderSummary = { id, number, status, totalCents, itemCount, placedAt }
```

## Checkout

| Método | Ruta | Body | Respuesta |
|--------|------|------|-----------|
| POST | /api/checkout/quote | `{ shippingMethod, discountCode?, email? }` | `CheckoutQuote` · 422 `EMPTY_CART` |
| POST | /api/checkout/orders | header `Idempotency-Key` (uuid) + `{ email, shippingAddress, shippingMethod, discountCode?, card, expectedTotalCents }` | 201 `OrderDetail` (`paid`) · 402 `PAYMENT_DECLINED{reason}` (pedido `cancelled`, stock liberado) · 202 `OrderDetail` (`pending_payment`, timeout del proveedor) · 409 `PRICE_CHANGED{quote}` / `REQUEST_IN_PROGRESS` · 422 `INSUFFICIENT_STOCK{lines}` / `INVALID_DISCOUNT{reason}` / `EMPTY_CART` / `IDEMPOTENCY_KEY_REUSED` · 400 |

Repetir la misma `Idempotency-Key` con el mismo body devuelve exactamente la misma respuesta.

## Pedidos del cliente (requireAuth)

| Método | Ruta | Respuesta |
|--------|------|-----------|
| GET | /api/orders?page= | `{ items: OrderSummary[], total, page, pageSize: 10 }` |
| GET | /api/orders/:number | `OrderDetail` · 404 si no es del cliente |

## Administración (requireRole admin)

| Método | Ruta | Body | Respuesta |
|--------|------|------|-----------|
| GET | /api/admin/orders?status=&from=&to=&page= | — | `{ items: (OrderSummary & {email})[], total, page, pageSize: 20 }` |
| GET | /api/admin/orders/:number | — | `OrderDetail` |
| POST | /api/admin/orders/:number/ship | `{ expectedVersion, trackingCode }` | `OrderDetail` · 422 `INVALID_TRANSITION` |
| POST | /api/admin/orders/:number/cancel | `{ expectedVersion, reason }` | `OrderDetail` · 422 `INVALID_TRANSITION` |
