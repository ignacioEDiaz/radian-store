# Implementation Plan: Navegación del catálogo (tienda)

**Branch**: `004-catalog-browsing` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

## Summary

Query handlers del contexto `catalog` que leen exclusivamente read-db (tablas proyectadas en 003)
envueltos en la caché por tags (`Cache.wrap`). Listado con filtros, facetas con conteos
"excluyendo el propio filtro", orden y paginación; detalle con relacionados; búsqueda con
`tsvector` + `pg_trgm` (tolerancia a errores); portada. ETag/304 en respuestas públicas. En la
web: `catalogService` + hooks React Query, estado de filtros en la URL, prefetch de la página
siguiente, imágenes responsivas, y la estética oscura de la marca (negro/bordó, tipografía Geist).

## Technical Context

**Storage**: read-db (`catalog_products`, `catalog_variants`, `catalog_collections`,
`catalog_collection_products`), Redis

**Testing**: unit (normalización de filtros → clave de caché, construcción de SQL), integración
(query handlers contra read-db con datos sembrados por la proyección; caché real), contrato
(rutas, ETag/304), web (CollectionPage con filtros en URL, ProductPage selector de variantes,
SearchBox con debounce usando timers falsos)

**Performance Goals**: p95 < 150 ms con caché caliente, < 500 ms fría (SC-001)

**Constraints**: ningún query handler importa `writeDb`; TTL por defecto 300 s (la invalidación
por eventos garantiza frescura < 2 s)

## Constitution Check

| Principio | Cumplimiento |
|-----------|--------------|
| I. TDD | ver tasks.md |
| II. DDD | queries en `catalog/application/queries`, puerto `CatalogReadModel` implementado en `infrastructure/read-model/pg-catalog-read-model.ts` |
| III. CQRS | solo read-db; regla de dependency-cruiser: `**/queries/**` no puede importar repositorios de escritura |
| IV. Caché | `Cache.wrap` con tags `catalog:list`, `catalog:product:<id>`, `catalog:collection:<slug>`, `catalog:home`; métricas por `name` de consulta; fallback sin Redis |
| V. Observabilidad | panel "Catalog cache hit ratio" y latencia de rutas `/api/catalog/*` |
| VI. Contratos | `packages/contracts/src/catalog.ts` |
| VII. Frontend | `features/catalog/{services,hooks,components,pages}` |

**Result**: PASS.

## Project Structure

```text
apps/api/src/modules/catalog/
├── application/queries/ list-products.ts, get-product-detail.ts, list-collections.ts,
│                        get-collection.ts, search-suggestions.ts, get-home.ts,
│                        product-filters.ts (normalización + clave canónica)
└── infrastructure/
    ├── read-model/pg-catalog-read-model.ts (SQL de listados, facetas, búsqueda)
    └── http/catalog-routes.ts (+ plugin etag)
apps/web/src/features/catalog/
├── services/catalogService.ts
├── hooks/ useProducts.ts, useProduct.ts, useCollections.ts, useSearchSuggestions.ts,
│          useHome.ts, useFiltersFromUrl.ts
├── components/ ProductCard, ProductGrid, FiltersPanel, SortSelect, Pagination, Gallery,
│               VariantSelector, ResponsiveImage, SearchBox, Skeletons, PriceTag
└── pages/ HomePage, CollectionPage (/tienda y /colecciones/:slug), ProductPage,
           SearchPage, NotFoundPage
```

## Diseño clave

- **Filtros**: `ProductFilters` validado con Zod; normalización (orden alfabético de arrays,
  minúsculas) → clave `catalog:list:<sha1(json)>`. Valores inválidos → 400; claves desconocidas
  se ignoran.
- **Listado SQL**: CTE `base` = publicados (+ colección vía join). Filtro por color/talle con
  `EXISTS` sobre `catalog_variants` (con `available_qty > 0` si `available=true`). Orden:
  `featured` (featured_rank NULLS LAST, published_at desc), `newest`, `price_asc`, `price_desc`,
  `best_selling` (sales_count desc). `COUNT(*) OVER()` para total.
- **Facetas**: una consulta por dimensión aplicando todos los filtros excepto el propio, en
  paralelo; rango de precio min/max. Todo el resultado (items + facetas) se cachea junto.
- **Búsqueda**: `search_tsv @@ websearch_to_tsquery('simple', q)` rankeado con `ts_rank`, unido a
  `word_similarity(q, search_text) > 0.3` para errores de tipeo; sugerencias = top 6 productos +
  colecciones por similitud de título.
- **Detalle**: `doc` jsonb + relacionados (misma colección o tipo, publicados, disponibles,
  máx. 8).
- **ETag**: hash del cuerpo serializado (o de la entrada de caché); `If-None-Match` → 304;
  `Cache-Control: public, max-age=0, must-revalidate`.
- **Web**: `useProducts(filters)` con `placeholderData: keepPreviousData` y
  `queryClient.prefetchQuery` de la página siguiente; filtros ↔ `URLSearchParams`;
  `ResponsiveImage` arma `srcset` desde `widths` y usa `loading="lazy"` salvo `priority`.
  `VariantSelector` deshabilita talles sin stock para el color elegido; la galería ordena primero
  las imágenes del color.

## Complexity Tracking

Sin violaciones.
