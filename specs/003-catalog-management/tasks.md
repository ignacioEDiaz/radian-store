---
description: "Task list for 003-catalog-management"
---

# Tasks: Gestión del catálogo e imágenes

**Input**: `/specs/003-catalog-management/` · **Tests**: OBLIGATORIOS (TDD).

## Phase 1: Setup

- [ ] T001 Dependencias `sharp`, `file-type`, `@fastify/multipart` en `apps/api`
- [ ] T002 [P] Contratos `packages/contracts/src/catalog-admin.ts`
- [ ] T003 [P] Migraciones write `0003_catalog.ts`, `0004_inventory.ts`, `0005_media.ts`; read `0003_catalog_read.ts` (con `pg_trgm`)
- [ ] T004 [P] Fixtures de test `apps/api/test/fixtures/` (jpg con EXIF, png, webp, pdf renombrado a .png)

## Phase 2: Foundational (dominio)

- [ ] T005 [P] Tests unit `test/unit/catalog/domain/product.test.ts`: creación en draft, slug, precio/compareAt, variantes duplicadas, imágenes y orden, publish con motivos, transiciones de estado, versión, eventos con snapshot
- [ ] T006 [P] Tests unit `test/unit/catalog/domain/collection.test.ts`
- [ ] T007 [P] Tests unit `test/unit/inventory/domain/inventory-item.test.ts`: ajustes, no negativos, `reserved ≤ onHand`
- [ ] T008 [P] Tests unit `test/unit/media/domain/media-asset.test.ts`
- [ ] T009 Implementar `modules/catalog/domain/*`, `modules/inventory/domain/*`, `modules/media/domain/*`

## Phase 3: User Story 2 - Imágenes (P1) — se implementa primero porque publicar requiere imágenes

- [ ] T010 [P] [US2] Test integración `test/integration/media/sharp-image-processor.test.ts`: rechaza no-imagen, quita EXIF, genera anchos ≤ original
- [ ] T011 [P] [US2] Test integración `test/integration/media/local-disk-storage.test.ts` (dir temporal): put/get/delete, limpieza ante fallo
- [ ] T012 [P] [US2] Test unit `test/unit/media/application/upload-media.test.ts`: dedupe por sha256, rollback de archivos si falla el guardado
- [ ] T013 [US2] Implementar `media/infrastructure/*` y `media/application/commands/upload-media.ts`
- [ ] T014 [P] [US2] Test contrato `test/contract/media/media-routes.test.ts`: subida multipart 201/200, 415, 413, 401/403, GET `/media/:id/:w.webp` con headers de caché, 404 ancho inválido

## Phase 4: User Story 1 - Productos y variantes (P1) 🎯

- [ ] T015 [P] [US1] Test integración `test/integration/catalog/pg-product-repository.test.ts`: guardar agregado completo (variantes, imágenes), versión, `SKU_TAKEN`, outbox
- [ ] T016 [US1] Implementar `catalog/infrastructure/persistence/pg-product-repository.ts` y `pg-slug-uniqueness.ts`
- [ ] T017 [P] [US1] Tests unit de handlers `test/unit/catalog/application/{create-product,update-product-details,add-variant,update-variant,remove-variant,attach-image,reorder-images}.test.ts`
- [ ] T018 [US1] Implementar command handlers de producto
- [ ] T019 [P] [US1] Test integración `test/integration/catalog/catalog-projection.test.ts`: eventos → `catalog_products`, `catalog_variants`, `doc` correcto, idempotente, invalida tags
- [ ] T020 [US1] Implementar `catalog/infrastructure/projections/catalog-projection.ts`
- [ ] T021 [P] [US1] Test contrato `test/contract/catalog/admin-products.test.ts`: CRUD, 409 versión, 403 cliente
- [ ] T022 [US1] Implementar queries admin (`list-admin-products`, `get-admin-product` desde read-db) y `admin-catalog-routes.ts`

## Phase 5: User Story 3 - Publicación y stock (P1)

- [ ] T023 [P] [US3] Test unit `test/unit/inventory/application/{on-variant-added,adjust-stock}.test.ts`
- [ ] T024 [P] [US3] Test integración `test/integration/inventory/inventory.test.ts`: `VariantAdded` → `InventoryItem` creado; ajuste → movimiento + evento → `catalog_variants.available_qty` y `available` del producto actualizados
- [ ] T025 [US3] Implementar `inventory/*` (repo, handlers, proyección, rutas)
- [ ] T026 [P] [US3] Test contrato publish/unpublish/archive: 422 con `reasons`, despublicado desaparece de lectura pública
- [ ] T027 [US3] Implementar publish/unpublish/archive/featured-rank

## Phase 6: User Story 4 - Colecciones (P2)

- [ ] T028 [P] [US4] Tests unit handlers de colección y test integración repo + proyección
- [ ] T029 [P] [US4] Test contrato `admin-collections.test.ts`
- [ ] T030 [US4] Implementar colecciones (repo, handlers, proyección, rutas) y handler `ProductArchived` → quitar de colecciones

## Phase 7: User Story 5 - Importación inicial (P2)

- [ ] T031 [US5] `tools/extract-radian-catalog.ts`: genera `apps/api/seed/radian/catalog.json` + `images/` desde el scrape
- [ ] T032 [P] [US5] Test integración `test/integration/catalog/import-radian-catalog.test.ts` con un catálogo reducido: crea, publica, segunda corrida no duplica
- [ ] T033 [US5] Implementar `src/scripts/import-radian-catalog.ts` (usa handlers) y script `seed:catalog`

## Phase 8: Panel de administración (web) — US1–US4

- [ ] T034 [P] Tests web `features/admin-catalog/pages/ProductsListPage.test.tsx`, `ProductEditorPage.test.tsx` (crear, variantes, conflicto de versión), `ImageManager.test.tsx` (subida, alt, reorden accesible con botones), `StockAdjustDialog.test.tsx`, `CollectionEditorPage.test.tsx`
- [ ] T035 Implementar `adminCatalogService`, hooks (`useAdminProducts`, `useAdminProduct`, mutaciones que hacen `setQueryData` con el snapshot) y páginas/componentes

## Phase 9: Polish

- [ ] T036 Métricas de media + paneles en Grafana
- [ ] T037 Suite completa, lint, typecheck, arch; validar quickstart

## Dependencies

001 y 002 completas. Dominio → Media → Productos → Stock/publicación → Colecciones → Import → Web.
