# Research: Navegación del catálogo

## Búsqueda

- **Decision**: full-text de PostgreSQL (`tsvector`, configuración `simple` porque el contenido
  está en inglés y la UI en español) + `pg_trgm` `word_similarity` para errores de tipeo.
- **Rationale**: sin infraestructura extra; con ~50 productos es sobrado; índices GIN.
- **Alternatives**: Elasticsearch/Meilisearch (otra pieza a operar sin necesidad a esta escala).

## Facetas

- **Decision**: conteos por dimensión excluyendo el propio filtro (comportamiento estándar de
  e-commerce), en consultas paralelas, cacheadas con el listado.
- **Alternatives**: calcular en memoria en el frontend (no escala con paginación).

## Caché HTTP

- **Decision**: ETag fuerte del cuerpo + `must-revalidate`; las imágenes son inmutables por URL.
- **Rationale**: evita servir contenido viejo desde el navegador y ahorra ancho de banda.

## Estado de filtros en la web

- **Decision**: la URL es la fuente de verdad (`useSearchParams`), React Query cachea por
  `queryKeys.catalog.list(filters)`.
- **Rationale**: compartible, recargable y sin estado duplicado.
