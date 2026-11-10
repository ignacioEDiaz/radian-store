# Data Model: Carrito

## Dominio

- **Cart** (agregado): `id`, `owner: {kind:'guest'} | {kind:'customer', customerId}`,
  `lines: CartLine[]` (≤ 50), `version`, `createdAt`, `updatedAt`.
- **CartLine**: `id`, `variantId`, `productId`, `quantity` (1–10), `unitPriceCents` (al agregar).
- **AvailableVariant** (dato del puerto): `variantId`, `productId`, `published`, `priceCents`,
  `available`.

## write-db

| Tabla | Columnas |
|-------|----------|
| carts | id PK, customer_id uuid null UNIQUE, version, created_at, updated_at; índice (updated_at) where customer_id is null |
| cart_lines | id PK, cart_id FK on delete cascade, variant_id, product_id, quantity CHECK 1..10, unit_price_cents, position; UNIQUE(cart_id, variant_id) |

## read-db

| Tabla | Columnas |
|-------|----------|
| cart_snapshots | cart_id PK, customer_id null, lines jsonb (`[{lineId, variantId, productId, quantity, unitPriceCents}]`), updated_at; índice (customer_id) |

La consulta une `lines` con `catalog_variants` y `catalog_products` (`doc` para título, imagen,
color, talle) para calcular precio vigente, disponibilidad y avisos.
