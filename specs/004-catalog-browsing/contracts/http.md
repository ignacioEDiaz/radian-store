# HTTP Contracts: Navegación del catálogo

Públicas, sin autenticación. Esquemas en `packages/contracts/src/catalog.ts`. Todas responden con
`ETag` y aceptan `If-None-Match` (304).

| Método | Ruta | Query | Respuesta |
|--------|------|-------|-----------|
| GET | /api/catalog/products | `collection?`, `q?`, `color?` (repetible), `size?` (rep.), `material?` (rep.), `type?` (rep.), `minPrice?`, `maxPrice?` (centavos), `available?` (bool), `sort?` = `featured`\|`newest`\|`price_asc`\|`price_desc`\|`best_selling`, `page?` (≥1) | `ProductList` · 400 `INVALID_FILTER` |
| GET | /api/catalog/products/:slug | — | `ProductDetail` · 404 `PRODUCT_NOT_FOUND` |
| GET | /api/catalog/collections | — | `CollectionView[]` |
| GET | /api/catalog/collections/:slug | — | `CollectionView` · 404 |
| GET | /api/catalog/search/suggestions | `q` (2–60) | `Suggestions` |
| GET | /api/catalog/home | — | `Home` |

Reglas:

- `minPrice > maxPrice` → 400.
- `page` mayor al último → `items: []` con `total` correcto.
- Productos no publicados nunca aparecen.
