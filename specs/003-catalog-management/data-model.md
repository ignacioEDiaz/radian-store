# Data Model: Gestión del catálogo

## Dominio

### Product (agregado, contexto catalog)

`id`, `slug`, `title` (2–120), `description` (≤ 5000), `productType` (p. ej. "Tops"),
`materials: string[]`, `tags: string[]`, `priceCents > 0`, `compareAtCents?` (> price),
`status: draft|published|archived`, `featuredRank?: int` (menor = más destacado),
`variants: Variant[]`, `images: ProductImage[]`, `publishedAt?`, `version`, `createdAt`, `updatedAt`.

- **Variant** (entidad): `id`, `sku` (A–Z, 0–9, `-`; 3–40), `color` (1–40), `size` (1–10),
  `priceCents?`.
- **ProductImage** (entidad): `id`, `mediaId`, `alt` (≤ 200; obligatorio para publicar),
  `color?`, `position`, `width`, `height`, `widths: number[]`.

Eventos: `ProductCreated`, `ProductDetailsUpdated`, `VariantAdded{…, initialStock}`,
`VariantUpdated`, `VariantRemoved`, `ProductImageAttached`, `ProductImageUpdated`,
`ProductImagesReordered`, `ProductImageRemoved`, `ProductPublished`, `ProductUnpublished`,
`ProductArchived`, `ProductFeaturedRankChanged`. Todos con `snapshot` del producto en el payload
para que la proyección sea simple y reconstruible.

### Collection (agregado, catalog)

`id`, `slug`, `title`, `description`, `imageMediaId?`, `productIds: uuid[]` (ordenados, sin
duplicados), `version`. Eventos `CollectionCreated`, `CollectionUpdated`,
`CollectionProductsSet`. Al archivarse un producto, un handler lo quita de sus colecciones.

### InventoryItem (agregado, inventory)

`variantId` (PK), `productId`, `sku`, `onHand ≥ 0`, `reserved ≥ 0` (`reserved ≤ onHand`),
`version`. Eventos `InventoryItemCreated`, `StockAdjusted{delta, reason, onHand, reserved}`
(006 agrega `StockReserved`, `StockReleased`, `StockCommitted`).

### MediaAsset (agregado, media)

`id`, `sha256` (único), `mimeType` original, `width`, `height`, `bytes`, `widths: number[]`,
`createdAt`.

## write-db

| Tabla | Columnas clave |
|-------|----------------|
| products | id PK, slug UNIQUE, title, description, product_type, materials text[], tags text[], price_cents int, compare_at_cents int null, status, featured_rank int null, published_at, version, created_at, updated_at |
| product_variants | id PK, product_id FK, sku UNIQUE, color, size, price_cents null, position; UNIQUE(product_id, color, size) |
| product_images | id PK, product_id FK, media_id, alt, color null, position, width, height, widths int[] |
| collections | id PK, slug UNIQUE, title, description, image_media_id null, version |
| collection_products | collection_id FK, product_id FK, position; PK(collection_id, product_id) |
| inventory_items | variant_id PK, product_id, sku, on_hand int CHECK ≥0, reserved int CHECK ≥0, CHECK reserved ≤ on_hand, version |
| stock_movements | id PK, variant_id, delta, reason, actor_id null, order_id null, created_at |
| media_assets | id PK, sha256 UNIQUE, mime_type, width, height, bytes, widths int[], created_at |

## read-db (compartido con 004)

| Tabla | Columnas |
|-------|----------|
| catalog_products | id PK, slug UNIQUE, status, title, product_type, materials text[], colors text[], sizes text[], min_price_cents, compare_at_cents, available bool, featured_rank, sales_count int default 0, published_at, updated_at, search_tsv tsvector (GIN), search_text text (GIN trigram), doc jsonb, version |
| catalog_variants | variant_id PK, product_id, sku, color, size, price_cents, available_qty int; índice (product_id), (color, size) |
| catalog_collections | id PK, slug UNIQUE, title, description, image jsonb, product_count, updated_at |
| catalog_collection_products | collection_id, product_id, position; PK(collection_id, product_id) |

`doc` contiene el `ProductDetail` listo para servir (descripción, imágenes con URLs y anchos,
variantes con disponibilidad, precios). Extensión `pg_trgm` habilitada en read-db.
