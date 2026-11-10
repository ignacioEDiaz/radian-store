# Research: Gestión del catálogo

## Procesamiento de imágenes

- **Decision**: sharp (libvips) con binarios precompilados; WebP q=82; anchos 320/640/960/1280/1920.
- **Rationale**: rápido y bajo en memoria; WebP reduce ~70 % vs PNG (comprobado en el scrape:
  1.5 GB → 104 MB).
- **Alternatives**: AVIF (codificación 5–10× más lenta), jimp (JS puro, lento).

## Validación del tipo de archivo

- **Decision**: `file-type` sobre los primeros bytes + whitelist; se ignora la extensión y el
  `content-type` del cliente.

## Almacenamiento

- **Decision**: puerto `MediaStorage` con adaptador de disco local (`MEDIA_DIR`, volumen Docker).
- **Rationale**: requisito "las imágenes se persisten en el backend"; el puerto permite S3/MinIO.
- **Alternatives**: `bytea` en PostgreSQL (infla la base de escritura y los backups, y cada imagen
  pasaría por el pool), CDN externo (prohibido por la constitución).

## Unicidad de SKU y slug

- **Decision**: índice único en base + verificación previa amigable; el índice es la garantía final
  ante concurrencia.

## Stock

- **Decision**: contexto `inventory` con `on_hand`/`reserved` y movimientos auditables.
- **Rationale**: reservas con `UPDATE ... WHERE on_hand - reserved >= $q` (atómico, sin locks
  explícitos de larga duración).

## Datos semilla

- **Decision**: extraer del scrape existente (HTML con JSON de variantes de Shopify + imágenes
  descargadas) a un JSON versionado en el repo.
- **Rationale**: demo realista, reproducible offline, y el import ejercita los casos de uso reales.
