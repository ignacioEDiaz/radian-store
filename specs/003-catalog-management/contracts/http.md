# HTTP Contracts: Gestión del catálogo

Todas las rutas `/api/admin/*` requieren `requireRole('admin')`. Esquemas en
`packages/contracts/src/catalog-admin.ts`. Las mutaciones devuelven el snapshot completo
`AdminProduct` / `AdminCollection` (read-your-writes).

```ts
AdminVariant = { id, sku, color, size, priceCents: number|null, onHand, reserved, available }
AdminImage = { id, mediaId, url, alt, color: string|null, position, width, height, widths }
AdminProduct = { id, slug, title, description, productType, materials, tags, priceCents,
  compareAtCents: number|null, status, featuredRank: number|null, variants: AdminVariant[],
  images: AdminImage[], publishedAt: string|null, version, updatedAt }
MediaAsset = { id, url, width, height, widths, mimeType, bytes }
```

## Productos

| Método | Ruta | Body | Respuesta |
|--------|------|------|-----------|
| GET | /api/admin/products?status=&q=&page= | — | `{ items: AdminProductRow[], total, page, pageSize }` |
| POST | /api/admin/products | `{ title, description, productType, materials, tags, priceCents, compareAtCents? }` | 201 `AdminProduct` |
| GET | /api/admin/products/:id | — | `AdminProduct` · 404 |
| PATCH | /api/admin/products/:id | `{ expectedVersion, …campos }` | `AdminProduct` · 409 `VERSION_CONFLICT` |
| POST | /api/admin/products/:id/variants | `{ expectedVersion, sku, color, size, priceCents?, initialStock }` | 201 `AdminProduct` · 409 `SKU_TAKEN`/`DUPLICATE_VARIANT` |
| PATCH | /api/admin/products/:id/variants/:variantId | `{ expectedVersion, sku?, color?, size?, priceCents? }` | `AdminProduct` |
| DELETE | /api/admin/products/:id/variants/:variantId?expectedVersion= | — | `AdminProduct` |
| POST | /api/admin/products/:id/images | `{ expectedVersion, mediaId, alt, color? }` | 201 `AdminProduct` |
| PATCH | /api/admin/products/:id/images/:imageId | `{ expectedVersion, alt?, color? }` | `AdminProduct` |
| PUT | /api/admin/products/:id/images/order | `{ expectedVersion, imageIds: uuid[] }` | `AdminProduct` |
| DELETE | /api/admin/products/:id/images/:imageId?expectedVersion= | — | `AdminProduct` |
| POST | /api/admin/products/:id/publish \| unpublish \| archive | `{ expectedVersion }` | `AdminProduct` · 422 `NOT_PUBLISHABLE` (`reasons[]`) |
| PUT | /api/admin/products/:id/featured-rank | `{ expectedVersion, rank: number|null }` | `AdminProduct` |

## Inventario

| Método | Ruta | Body | Respuesta |
|--------|------|------|-----------|
| POST | /api/admin/inventory/:variantId/adjustments | `{ delta: int≠0, reason: 'restock'|'correction'|'damage'|'other', note? }` | `{ variantId, onHand, reserved, available }` · 422 `NEGATIVE_STOCK` |

## Media

| Método | Ruta | Body | Respuesta |
|--------|------|------|-----------|
| POST | /api/admin/media | multipart `file` (≤10 MB) | 201 `MediaAsset` (200 si ya existía por hash) · 415 `UNSUPPORTED_MEDIA` · 413 |
| GET | /media/:mediaId/:width.webp | — (público) | `image/webp`, `Cache-Control: public, max-age=31536000, immutable`, `ETag` · 404 |

## Colecciones

| Método | Ruta | Body | Respuesta |
|--------|------|------|-----------|
| GET | /api/admin/collections | — | `AdminCollection[]` |
| POST | /api/admin/collections | `{ title, description, imageMediaId? }` | 201 `AdminCollection` |
| PATCH | /api/admin/collections/:id | `{ expectedVersion, title?, description?, imageMediaId? }` | `AdminCollection` |
| PUT | /api/admin/collections/:id/products | `{ expectedVersion, productIds: uuid[] }` | `AdminCollection` · 422 `UNKNOWN_PRODUCT` |
