# Implementation Plan: Checkout y pedidos

**Branch**: `006-checkout-orders` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

## Summary

Bounded context `ordering` con agregados `Order` y `DiscountCode`. El caso de uso `PlaceOrder`
es idempotente (`Idempotency-Key`), recalcula precios vigentes, aplica descuento y envío,
**reserva stock atómicamente** (puerto `StockReservations` implementado por inventory con
`UPDATE … WHERE on_hand - reserved >= q`, ordenado por `variant_id` para evitar deadlocks) y crea
el pedido en `pending_payment` en una transacción. Luego cobra con `PaymentGateway` (simulado)
**fuera** de la transacción y confirma (`paid` + commit de la reserva) o cancela (liberando) en
una segunda transacción. Un job libera reservas vencidas (15 min). Proyecciones a read-db para
historial y administración; `OrderPaid` incrementa `sales_count` del catálogo y una política del
contexto cart vacía el carrito.

## Technical Context

**Storage**: write-db `orders`, `order_lines`, `order_status_history`, `payments`,
`stock_reservations`, `discount_codes`, `discount_redemptions`, `idempotency_keys`, secuencia
`order_number_seq`; read-db `order_summaries`, `order_details`

**Testing**: unit (Order: máquina de estados y totales; `PricingCalculator`; `DiscountCode`;
`PlaceOrder` con fakes en todos los caminos), integración (reservas concurrentes: 50 compras
simultáneas de la última unidad → 1 éxito; idempotencia con 2 requests simultáneos; expiración
con reloj falso; proyecciones), contrato (checkout, pedidos, admin), web (checkout completo con
MSW, doble clic, errores por campo)

**Performance Goals**: `PlaceOrder` < 500 ms p95 (sin contar la latencia simulada de pago)

**Constraints**: nunca se persiste el número de tarjeta completo ni el CVC; los logs redactan
`card.*`

## Constitution Check

| Principio | Cumplimiento |
|-----------|--------------|
| I. TDD | ver tasks.md; los tests de concurrencia son de integración contra PostgreSQL real |
| II. DDD | `ordering` usa puertos `CheckoutCartSource`, `CatalogPricing`, `StockReservations`, `PaymentGateway`; los adaptadores viven en `infrastructure` de cada contexto proveedor y se inyectan en el composition root |
| III. CQRS | comandos en write-db; historial/admin desde read-db; el resultado del comando devuelve `OrderDetail` |
| IV. Pools/caché | transacciones cortas (el cobro queda fuera para no retener conexiones del pool); `OrderPaid` invalida `catalog:home` y `catalog:list` (más vendidos) |
| V. Observabilidad | `orders_placed_total{result}`, `payment_attempts_total{result}`, `stock_reservations_active`, `checkout_duration_seconds`; paneles en Grafana |
| VI. Contratos | `packages/contracts/src/ordering.ts` |
| VII. Frontend | `features/checkout`, `features/orders`, `features/admin-orders` |

**Result**: PASS.

## Project Structure

```text
apps/api/src/modules/ordering/
├── domain/ order.ts, order-line.ts, order-status.ts, shipping-method.ts, discount-code.ts,
│           pricing-calculator.ts, events.ts, order-repository.ts, discount-code-repository.ts
├── application/
│   ├── ports/ checkout-cart-source.ts, catalog-pricing.ts, stock-reservations.ts,
│   │          payment-gateway.ts, idempotency-store.ts, order-number-generator.ts
│   ├── commands/ quote-checkout.ts, place-order.ts, ship-order.ts, cancel-order.ts,
│   │            expire-pending-orders.ts
│   └── queries/ list-my-orders.ts, get-my-order.ts, list-admin-orders.ts, get-admin-order.ts
└── infrastructure/
    ├── persistence/ pg-order-repository.ts, pg-discount-code-repository.ts,
    │                pg-idempotency-store.ts, pg-order-number-generator.ts
    ├── payments/fake-payment-gateway.ts
    ├── projections/ order-projection.ts, sales-count-projection.ts
    ├── jobs/pending-order-expiry.ts (cada 30 s)
    └── http/ checkout-routes.ts, order-routes.ts, admin-order-routes.ts
apps/api/src/modules/inventory/infrastructure/pg-stock-reservations.ts   # implementa el puerto
apps/api/src/modules/cart/infrastructure/policies/clear-cart-on-order-paid.ts
apps/web/src/features/checkout/ (checkoutService, useCheckoutQuote, usePlaceOrder,
    CheckoutPage, ContactSection, ShippingAddressSection, ShippingMethodSection,
    DiscountCodeField, PaymentSection, OrderSummary, OrderConfirmationPage)
apps/web/src/features/orders/ (ordersService, useMyOrders, useMyOrder, OrdersPage, OrderDetailPage)
apps/web/src/features/admin-orders/ (adminOrdersService, AdminOrdersPage, AdminOrderDetailPage)
```

## Diseño clave

- **Idempotencia**: `INSERT INTO idempotency_keys(key, scope, request_hash, status='processing')
  ON CONFLICT DO NOTHING`. Si ya existe: mismo hash y `completed` → devuelve la respuesta
  guardada; `processing` → 409 `REQUEST_IN_PROGRESS` (el cliente reintenta); hash distinto → 422
  `IDEMPOTENCY_KEY_REUSED`. `scope` = customerId o email normalizado.
- **Transacción 1**: carga carrito + precios vigentes (write-db) → `PricingCalculator`
  (subtotal, descuento redondeado hacia abajo, envío según subtotal con descuento, total) → si el
  cliente envió `expectedTotalCents` y difiere → 409 `PRICE_CHANGED` con el nuevo desglose →
  reserva todas las líneas (o `INSUFFICIENT_STOCK{lines}` y rollback) → `Order.place()` →
  guarda orden + outbox.
- **Pago** (sin transacción abierta): `PaymentGateway.charge({ amountCents, card })`. Tarjetas
  de prueba: `4242 4242 4242 4242` aprobada; `4000 0000 0000 0002` rechazada;
  `4000 0000 0000 9995` fondos insuficientes; `4000 0000 0000 0119` timeout (excede 5 s →
  `PaymentTimeout`). Validación Luhn, vencimiento futuro, CVC 3–4 dígitos.
- **Transacción 2**: aprobado → `order.markPaid(payment)`, `StockReservations.commit(orderId)`
  (`on_hand -= q, reserved -= q`), redención del descuento; rechazado → `order.cancel
  ('payment_declined')` + `release`; timeout → queda `pending_payment` (el job resuelve).
  Se guarda la respuesta en `idempotency_keys` (`completed`).
- **Order** (máquina de estados): `place` → `pending_payment`; `markPaid`; `ship(tracking)` solo
  desde `paid`; `cancel(reason)` desde `pending_payment` o `paid` (si `paid` → requiere reintegro
  previo). Historial de estados con fecha y actor.
- **Cancelación admin de pagado**: `PaymentGateway.refund` → `order.cancel('admin', refund)` →
  `StockReservations.restock(orderId)` (`on_hand += q`).
- **Expiración**: job toma `pending_payment` con `reservation_expires_at < now` (`FOR UPDATE SKIP
  LOCKED`), cancela y libera.
- **Políticas por eventos**: `ordering.OrderPaid` → cart vacía el carrito del comprador;
  → proyección suma `sales_count`. La web además limpia `queryKeys.cart` al confirmar.
- **Invitados**: `PlaceOrder` sin sesión requiere `email`; el pedido queda asociado al email. La
  confirmación se muestra con la respuesta del comando (los invitados no tienen historial).
- **Número de pedido**: `RS-` + `nextval('order_number_seq')` con relleno a 6 dígitos.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Dos transacciones + job de expiración (saga simple) | No retener conexiones del pool ni locks durante el cobro externo | Una sola transacción incluyendo el cobro bloquea filas de inventario segundos y agota el pool |
