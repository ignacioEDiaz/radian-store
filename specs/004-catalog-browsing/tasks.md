---
description: "Task list for 004-catalog-browsing"
---

# Tasks: Navegación del catálogo (tienda)

**Input**: `/specs/004-catalog-browsing/` · **Tests**: OBLIGATORIOS (TDD).

## Phase 1: Setup

- [ ] T001 [P] Contratos `packages/contracts/src/catalog.ts`
- [ ] T002 [P] Migración read `0004_catalog_indexes.ts`
- [ ] T003 [P] Builder de datos de lectura para tests `test/support/catalog-read-seed.ts` (inserta productos vía la proyección real)
- [ ] T004 Regla dependency-cruiser: `queries/**` no importa `persistence/pg-*-repository`

## Phase 2: Foundational

- [ ] T005 [P] Test unit `test/unit/catalog/application/product-filters.test.ts`: validación, normalización y clave canónica estable
- [ ] T006 Implementar `product-filters.ts`
- [ ] T007 [P] Test contrato `test/contract/http/etag.test.ts`: ETag presente, 304 con `If-None-Match`
- [ ] T008 Implementar plugin ETag en `shared/infrastructure/http/etag.ts`

## Phase 3: User Story 1 - Listado con filtros (P1) 🎯

- [ ] T009 [P] [US1] Test integración `test/integration/catalog/list-products.test.ts`: filtros combinados, facetas excluyendo el propio filtro, orden, paginación, página fuera de rango, solo publicados, agotados
- [ ] T010 [US1] Implementar `pg-catalog-read-model.ts` (listado + facetas) y `list-products.ts` con `Cache.wrap`
- [ ] T011 [P] [US1] Test contrato `test/contract/catalog/products.test.ts`: forma, 400 filtros inválidos
- [ ] T012 [US1] Rutas `catalog-routes.ts` (listado, colecciones)
- [ ] T013 [P] [US1] Tests web `CollectionPage.test.tsx`: filtros ↔ URL, facetas con conteos, paginación, skeleton/vacío/error con reintento; `ProductCard.test.tsx`
- [ ] T014 [US1] Implementar `catalogService`, `useProducts` (keepPreviousData + prefetch), `useFiltersFromUrl`, `ProductGrid`, `ProductCard`, `FiltersPanel`, `SortSelect`, `Pagination`, `ResponsiveImage`, `CollectionPage`

## Phase 4: User Story 2 - Detalle (P1)

- [ ] T015 [P] [US2] Test integración `get-product-detail.test.ts`: doc, relacionados, 404 despublicado
- [ ] T016 [US2] Implementar `get-product-detail.ts` + ruta
- [ ] T017 [P] [US2] Tests web `ProductPage.test.tsx` / `VariantSelector.test.tsx`: cambio de color reordena galería, talles agotados deshabilitados, 404
- [ ] T018 [US2] Implementar `useProduct`, `Gallery`, `VariantSelector`, `PriceTag`, `ProductPage`, `NotFoundPage`

## Phase 5: User Story 3 - Búsqueda (P2)

- [ ] T019 [P] [US3] Test integración `search.test.ts`: relevancia, tolerancia a "leathr", sugerencias ≤ 6
- [ ] T020 [US3] Implementar búsqueda en el read model, `search-suggestions.ts`, parámetro `q` en listado, rutas
- [ ] T021 [P] [US3] Tests web `SearchBox.test.tsx` (debounce 200 ms con timers falsos, navegación con teclado) y `SearchPage.test.tsx`
- [ ] T022 [US3] Implementar `useSearchSuggestions`, `SearchBox` (en el header), `SearchPage`

## Phase 6: User Story 4 - Portada (P2)

- [ ] T023 [P] [US4] Test integración `get-home.test.ts` y test web `HomePage.test.tsx`
- [ ] T024 [US4] Implementar `get-home.ts`, ruta y `HomePage` (hero con video/imagen del catálogo, colecciones destacadas, novedades, destacados)

## Phase 7: User Story 5 - Caché (P2)

- [ ] T025 [P] [US5] Test integración `test/integration/catalog/catalog-cache.test.ts`: segunda consulta es hit (métrica), cambio de precio → invalidación → dato nuevo, Redis caído → sigue respondiendo
- [ ] T026 [US5] Ajustar tags de invalidación en la proyección de catálogo hasta pasar T025; paneles de caché por consulta en Grafana

## Phase 8: Polish

- [ ] T027 Estilos de marca (`apps/web/src/styles/`: tokens oscuros, Geist, grid responsive) y accesibilidad (axe en tests de páginas)
- [ ] T028 Suite completa, lint, typecheck, arch; validar quickstart

## Dependencies

003 completa (proyecciones y datos). US1 → US2 → US3/US4 → US5.
