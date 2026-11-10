# Implementation Plan: Gestión del catálogo e imágenes

**Branch**: `003-catalog-management` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

## Summary

Tres bounded contexts nuevos:

- **catalog**: agregados `Product` (con variantes e imágenes) y `Collection`.
- **inventory**: agregado `InventoryItem` por variante (`onHand`, `reserved`). Se separa del
  producto para que las reservas concurrentes del checkout (006) sean una sentencia atómica por
  variante sin bloquear el agregado `Product`.
- **media**: agregado `MediaAsset`; puertos `MediaStorage` (disco local del backend en un
  volumen) e `ImageProcessor` (sharp: valida, quita EXIF, genera WebP 320/640/960/1280/1920).

Comandos de administración sobre write-db; proyecciones a read-db (`catalog_products`,
`catalog_variants`, `catalog_collections`, `catalog_collection_products`) que también usa 004.
Importador idempotente del catálogo Radian (43 productos) que ejecuta los mismos comandos.
Panel de administración en la web.

## Technical Context

**Primary Dependencies**: sharp 0.35, file-type 22, @fastify/multipart 10

**Storage**: write-db `products`, `product_variants`, `product_images`, `collections`,
`collection_products`, `inventory_items`, `stock_movements`, `media_assets`; disco
`MEDIA_DIR` (volumen `media-data`); read-db tablas de catálogo.

**Testing**: unit (agregados e invariantes, handlers con fakes), integración (repos, proyecciones,
storage en directorio temporal, sharp real con imágenes fixture), contrato (rutas admin con
multipart), web (editor con MSW).

**Performance Goals**: subida + procesamiento de una imagen de 5 MB < 3 s; proyección < 1 s p95.

**Constraints**: archivos ≤ 10 MB (`@fastify/multipart` limits), solo JPEG/PNG/WebP por firma real.

## Constitution Check

| Principio | Cumplimiento |
|-----------|--------------|
| I. TDD | tasks.md ordena test → implementación por cada pieza |
| II. DDD | `catalog`, `inventory`, `media` sin imports cruzados de dominio; `catalog` referencia `mediaId` (id), `inventory` referencia `variantId` (id). Coordinación vía eventos y application services |
| III. CQRS | comandos → write-db + outbox; listados/detalle admin → read-db; respuestas de comandos devuelven el snapshot del agregado |
| IV. Pools/caché | proyecciones invalidan tags `catalog:product:<id>`, `catalog:list`, `catalog:collection:<slug>`, `catalog:home`; imágenes con `Cache-Control: public, max-age=31536000, immutable` + ETag |
| V. Observabilidad | métricas `media_uploads_total{result}`, `media_processing_seconds` |
| VI. Contratos | `packages/contracts/src/catalog-admin.ts`, validación multipart |
| VII. Frontend | `features/admin-catalog/{services,hooks,components,pages}` |

**Result**: PASS.

## Project Structure

```text
apps/api/src/modules/
├── catalog/
│   ├── domain/ product.ts, variant.ts, product-image.ts, collection.ts, slug.ts, money (shared),
│   │           product-status.ts, events.ts, product-repository.ts, collection-repository.ts,
│   │           slug-uniqueness.ts (puerto)
│   ├── application/commands/ create-product, update-product-details, add-variant, update-variant,
│   │           remove-variant, attach-image, update-image, reorder-images, remove-image,
│   │           publish-product, unpublish-product, archive-product, set-featured-rank,
│   │           create-collection, update-collection, set-collection-products
│   ├── application/queries/ list-admin-products, get-admin-product, list-admin-collections
│   └── infrastructure/ persistence/, projections/catalog-projection.ts, http/admin-catalog-routes.ts
├── inventory/
│   ├── domain/ inventory-item.ts, events.ts, inventory-repository.ts
│   ├── application/ commands/{create-inventory-item, adjust-stock}.ts,
│   │                event-handlers/on-variant-added.ts (crea InventoryItem con stock inicial)
│   └── infrastructure/ persistence/, projections/inventory-projection.ts, http/admin-inventory-routes.ts
└── media/
    ├── domain/ media-asset.ts, media-storage.ts (puerto), image-processor.ts (puerto)
    ├── application/commands/upload-media.ts (dedupe por sha256)
    └── infrastructure/ local-disk-storage.ts, sharp-image-processor.ts, http/media-routes.ts
apps/api/src/scripts/import-radian-catalog.ts
apps/api/seed/radian/catalog.json + images/*.webp     (generado por tools/extract-radian-catalog.ts)
apps/web/src/features/admin-catalog/ (ProductsListPage, ProductEditorPage, VariantsTable,
    ImageManager, StockAdjustDialog, CollectionsPage, CollectionEditorPage)
```

## Diseño clave

- **Product**: `create()` en `draft`, slug único (puerto `SlugUniqueness` que consulta write-db;
  sufijo `-2`, `-3`…). Invariantes: `compareAt > price`, combinación color+talle única,
  SKU único en el producto (unicidad global por índice → `ConflictError SKU_TAKEN`),
  `publish()` exige ≥1 variante, ≥1 imagen y alt en todas las imágenes. Estados
  `draft ⇄ published → archived`. `version` para concurrencia optimista: los comandos de edición
  reciben `expectedVersion` (409 `VERSION_CONFLICT`).
- **Variantes y stock**: `addVariant({sku, color, size, priceCents?, initialStock})` emite
  `catalog.VariantAdded`; en la **misma transacción** el caso de uso llama al puerto
  `InventoryProvisioner` (implementado por `inventory`) que crea el `InventoryItem`. Así la
  respuesta del comando ya incluye el stock inicial (read-your-writes) y catalog solo conoce el
  puerto, no el dominio de inventory. *(Enmienda durante la implementación: originalmente era una
  política asíncrona; se cambió porque la respuesta del comando no podía mostrar el stock.)*
- **Disponibilidad en lectura**: el `doc` del producto guarda la información estática; la
  disponibilidad por variante vive en `catalog_variants` (proyectada desde inventory) y se une al
  consultar, así un cambio de stock no reescribe el documento.
- **InventoryItem**: `onHand ≥ 0`, `reserved ≥ 0`, `available = onHand − reserved`;
  `adjust(delta, reason, actorId)` rechaza dejar `onHand < reserved`. Cada ajuste se registra en
  `stock_movements`. Eventos `inventory.StockAdjusted{onHand, reserved}`.
- **Media**: `UploadMedia(buffer, filename)` → `file-type` valida firma → `sha256`; si existe,
  devuelve el asset existente (idempotencia del importador) → sharp: `rotate()` (EXIF), sin
  metadatos, WebP q=82 en anchos ≤ ancho original (siempre al menos uno) → `MediaStorage.put`.
  Si falla a mitad, se borran los archivos escritos (sin huérfanos). URL pública
  `/media/<id>/<width>.webp`.
- **Proyección de catálogo** (read-db): un documento por producto (`doc jsonb`) + columnas
  filtrables; `catalog_variants` mantiene disponibilidad por variante (alimentada por eventos de
  catalog e inventory). La proyección recalcula `available`, `colors`, `sizes`,
  `min_price_cents` y `search_tsv`.
- **Importador**: `tools/extract-radian-catalog.ts` lee el HTML original + `_mapa.json` del scrape
  y genera `seed/radian/catalog.json` + imágenes WebP (máx. 1600 px). `import-radian-catalog.ts`
  usa los command handlers: si el slug existe lo saltea (idempotente).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Contexto `inventory` separado | Reservas atómicas por variante bajo concurrencia (006, SC-002) | Stock dentro de `Product` obliga a bloquear el agregado completo y serializa compras de distintos talles |
