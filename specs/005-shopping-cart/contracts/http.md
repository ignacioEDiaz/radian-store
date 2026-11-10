# HTTP Contracts: Carrito

Esquemas en `packages/contracts/src/cart.ts`. Dueño resuelto por sesión (`rs_session`) o cookie
firmada `rs_cart` (se emite en la primera mutación de un visitante).

```ts
CartLineView = { lineId, variantId, productSlug, title, color, size, image: ImageView|null,
  quantity, unitPriceCents, previousUnitPriceCents: number|null, lineTotalCents,
  available: boolean, maxQuantity: number, warnings: ('PRICE_CHANGED'|'OUT_OF_STOCK'|'QUANTITY_REDUCED')[] }
CartView = { id: string|null, lines: CartLineView[], itemCount, subtotalCents, currency: 'USD' }
```

| Método | Ruta | Body | Respuesta |
|--------|------|------|-----------|
| GET | /api/cart | — | `CartView` (vacío con `id: null` si no hay carrito) |
| POST | /api/cart/items | `{ variantId, quantity (1–10) }` | 200 `CartView` · 422 `INSUFFICIENT_STOCK{available}` / `PRODUCT_UNAVAILABLE` / `LINE_LIMIT` / `CART_FULL` · 404 `VARIANT_NOT_FOUND` |
| PATCH | /api/cart/items/:lineId | `{ quantity (1–10) }` | `CartView` · 422 · 404 `LINE_NOT_FOUND` |
| DELETE | /api/cart/items/:lineId | — | `CartView` |

Login (`POST /api/auth/login`) y registro, si reciben `rs_cart`, combinan el carrito y expiran la
cookie.
