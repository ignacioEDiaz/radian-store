# Data Model: Checkout y pedidos

## Dominio

- **Order** (agregado): `id`, `number` (`RS-000123`), `customerId?`, `email`, `lines: OrderLine[]`,
  `shippingAddress: Address`, `shippingMethod: 'standard'|'express'`, `discount?: {code,
  amountCents}`, `totals: {subtotalCents, discountCents, shippingCents, totalCents}`,
  `status: pending_payment|paid|shipped|cancelled`, `payment?: {provider, reference, brand,
  last4, amountCents, status}`, `refund?`, `trackingCode?`, `cancelReason?`,
  `reservationExpiresAt`, `history: {status, at, actor}[]`, `version`, `placedAt`.
- **OrderLine** (snapshot inmutable): `variantId`, `productId`, `sku`, `title`, `color`, `size`,
  `imageUrl`, `unitPriceCents`, `quantity`, `lineTotalCents`.
- **DiscountCode** (agregado): `id`, `code` (mayúsculas), `kind: percent|fixed`, `value`,
  `startsAt?`, `endsAt?`, `minSubtotalCents?`, `oncePerEmail: bool`, `active`.
- **PricingCalculator** (servicio de dominio): reglas de envío (estándar US$ 10, gratis si
  subtotal − descuento ≥ US$ 150; exprés US$ 25) y redondeo hacia abajo del descuento.
- **Eventos**: `OrderPlaced`, `OrderPaid`, `OrderPaymentFailed`, `OrderShipped`,
  `OrderCancelled` (con snapshot); inventory: `StockReserved`, `StockCommitted`, `StockReleased`,
  `StockRestocked`.

## write-db

| Tabla | Columnas |
|-------|----------|
| orders | id PK, number UNIQUE, customer_id null, email, status, shipping_address jsonb, shipping_method, discount jsonb null, subtotal_cents, discount_cents, shipping_cents, total_cents, payment jsonb null, refund jsonb null, tracking_code null, cancel_reason null, reservation_expires_at, version, placed_at, updated_at; índice (status, reservation_expires_at) |
| order_lines | id PK, order_id FK, variant_id, product_id, sku, title, color, size, image_url, unit_price_cents, quantity, line_total_cents |
| order_status_history | id PK, order_id FK, status, actor, at |
| stock_reservations | id PK, order_id, variant_id, quantity, status (active/committed/released/restocked), expires_at; UNIQUE(order_id, variant_id) |
| discount_codes | id PK, code UNIQUE, kind, value, starts_at, ends_at, min_subtotal_cents, once_per_email, active |
| discount_redemptions | id PK, code_id FK, email, order_id, redeemed_at; UNIQUE(code_id, email) parcial para once_per_email |
| idempotency_keys | key, scope, request_hash, status, response jsonb null, order_id null, created_at; PK(scope, key) |
| sequence | order_number_seq |

## read-db

| Tabla | Columnas |
|-------|----------|
| order_summaries | id PK, number, customer_id, email, status, total_cents, item_count, placed_at, updated_at; índices (customer_id, placed_at desc), (status, placed_at desc) |
| order_details | id PK, customer_id, doc jsonb (OrderDetail completo) |

`OrderPaid` → `catalog_products.sales_count += quantity` por producto (proyección de catálogo).
