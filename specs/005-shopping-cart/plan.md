# Implementation Plan: Carrito de compras

**Branch**: `005-shopping-cart` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

## Summary

Bounded context `cart` con el agregado `Cart` (dueño visitante o cliente, líneas, versión).
Las invariantes de disponibilidad se validan con el puerto `CatalogAvailability` (adaptador
anticorrupción que lee producto/variante/inventario en write-db, sin importar el dominio de
catalog). Los comandos devuelven un `CartView` calculado al momento; `GET /api/cart` lee
`cart_snapshots` de read-db unido con `catalog_variants`/`catalog_products` para precios y
disponibilidad vigentes. Cookie firmada `rs_cart` para visitantes; merge al iniciar sesión; tarea
periódica que elimina carritos de visitante inactivos. Web: drawer con actualización optimista.

## Technical Context

**Storage**: write-db `carts`, `cart_lines`; read-db `cart_snapshots` (lines jsonb)

**Testing**: unit (agregado: suma de líneas, límites 10/50, merge respetando stock; handlers con
fakes), integración (repo, proyección, query con precios vigentes, concurrencia de dos comandos),
contrato (cookies de visitante, merge en login), web (drawer, optimistic + rollback)

**Performance Goals**: comandos < 100 ms p95; contador actualizado al instante (optimista)

## Constitution Check

| Principio | Cumplimiento |
|-----------|--------------|
| I. TDD | ver tasks.md |
| II. DDD | `modules/cart`; acceso a catálogo solo por puerto `CatalogAvailability` (ACL); merge invocado por el caso de uso de login vía puerto `CartMerger` registrado por el módulo cart (identity no importa cart) |
| III. CQRS | comandos en write-db; `GET /api/cart` en read-db; respuestas de comando con `CartView` |
| IV. Pools/caché | sin caché (dato por usuario y barato); reintento automático ante conflicto de versión (máx. 3) |
| V. Observabilidad | `cart_operations_total{op,result}` |
| VI. Contratos | `packages/contracts/src/cart.ts` |
| VII. Frontend | `features/cart/{services,hooks,components}` |

**Result**: PASS.

## Project Structure

```text
apps/api/src/modules/cart/
├── domain/ cart.ts, cart-line.ts, cart-owner.ts, events.ts, cart-repository.ts
├── application/
│   ├── ports/catalog-availability.ts
│   ├── commands/ add-item.ts, change-quantity.ts, remove-line.ts, merge-guest-cart.ts,
│   │            clear-cart.ts, expire-guest-carts.ts
│   ├── queries/ get-cart.ts
│   └── cart-view-builder.ts      # arma CartView desde agregado + disponibilidad
└── infrastructure/
    ├── persistence/pg-cart-repository.ts, pg-catalog-availability.ts
    ├── projections/cart-projection.ts
    ├── read-model/pg-cart-read-model.ts
    ├── jobs/guest-cart-expiry.ts (cada hora)
    └── http/cart-routes.ts, cart-identity.ts (resuelve dueño: sesión o cookie rs_cart)
apps/web/src/features/cart/
├── services/cartService.ts
├── hooks/ useCart.ts, useAddToCart.ts, useUpdateCartLine.ts, useRemoveCartLine.ts
└── components/ CartDrawer.tsx, CartButton.tsx, CartLineItem.tsx, CartDrawerContext.tsx
```

## Diseño clave

- **Cart**: `addItem(variant: AvailableVariant, qty)` suma a la línea existente; valida
  `published`, `qty ≤ available` (acumulada), `≤ 10` por línea, `≤ 50` líneas → errores
  `PRODUCT_UNAVAILABLE`, `INSUFFICIENT_STOCK{available}`, `LINE_LIMIT`, `CART_FULL`.
  `unitPriceCents` se guarda al agregar para detectar cambios de precio.
- **Dueño**: si hay sesión → carrito del cliente (se crea al primer uso); si no → cookie firmada
  `rs_cart` (uuid, 30 días). Cookie inválida → carrito nuevo silencioso.
- **Merge**: el endpoint de login, tras autenticar, llama al puerto `CartMerger` (implementado por
  cart, registrado en el contenedor de dependencias) si hay cookie `rs_cart`: suma cantidades
  limitando por stock y por 10, borra el carrito de visitante y limpia la cookie.
- **Concurrencia**: `UPDATE carts SET version = version + 1 ... WHERE version = $v`; ante
  conflicto, el handler recarga y reintenta hasta 3 veces (las operaciones son reaplicables).
- **CartView**: `{ id, lines: [{ lineId, variantId, productSlug, title, color, size, image,
  quantity, unitPriceCents, previousUnitPriceCents?, lineTotalCents, available, maxQuantity,
  warnings[] }], itemCount, subtotalCents, warnings[] }`. Líneas no disponibles no suman.
- **Eventos**: `CartItemAdded`, `CartLineQuantityChanged`, `CartLineRemoved`, `CartCleared`,
  `CartsMerged`, `CartExpired` — todos con snapshot de líneas → proyección trivial.
- **Web**: `useAddToCart` hace `onMutate` optimista sobre `queryKeys.cart` (incrementa
  `itemCount` y agrega línea provisional), `onError` revierte y muestra el mensaje del
  problem+json, `onSuccess` reemplaza con el `CartView` del servidor y abre el drawer.

## Complexity Tracking

Sin violaciones.
