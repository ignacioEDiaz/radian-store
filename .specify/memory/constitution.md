# Radian Store Constitution

## Core Principles

### I. Test-Driven Development (NO NEGOCIABLE)

Todo código de producción nace de un test que falla.

- El ciclo Red → Green → Refactor es obligatorio para dominio, aplicación, infraestructura,
  endpoints HTTP y componentes/hooks del frontend.
- Un commit de implementación DEBE venir acompañado (o precedido) por los tests que lo cubren.
  Un PR sin tests nuevos para comportamiento nuevo se rechaza.
- Pirámide de tests: unitarios (dominio y aplicación, sin I/O), de integración (repositorios,
  proyecciones, caché y pools contra PostgreSQL/Redis reales vía contenedores) y de contrato
  (endpoints HTTP contra los esquemas de `packages/contracts`).
- Cobertura mínima: 90 % de líneas en `domain/` y `application/`, 80 % global por app.
- Los tests son deterministas: sin dependencia de reloj real, red externa ni orden de ejecución
  (se inyectan `Clock`, `IdGenerator` y puertos falsos).

**Razón**: el proyecto es una pieza de portafolio; los tests son la prueba de que la arquitectura
funciona y permiten refactorizar sin miedo.

### II. Domain-Driven Design con arquitectura hexagonal

El backend se organiza por *bounded contexts* (`catalog`, `identity`, `cart`, `ordering`) y cada
uno respeta capas con dependencias que solo apuntan hacia adentro:

- `domain/`: agregados, entidades, value objects, eventos de dominio y puertos (interfaces de
  repositorios). NO importa frameworks, drivers de base de datos, HTTP ni otros contextos.
- `application/`: casos de uso como *command handlers* y *query handlers*. Depende solo de
  `domain/` y de puertos.
- `infrastructure/`: adaptadores (PostgreSQL, Redis, almacenamiento de archivos, HTTP, pasarela de
  pago falsa). Implementa puertos.
- Los contextos se comunican solo por eventos de dominio o por puertos explícitos, nunca
  importando el dominio de otro contexto.
- Las invariantes viven en los agregados; un agregado se modifica únicamente a través de sus
  métodos y se persiste completo en una transacción.
- La regla de dependencias se verifica automáticamente (`dependency-cruiser`) en CI.

**Razón**: aislar el modelo de negocio de la tecnología lo hace testeable y entendible.

### III. CQRS con bases separadas de escritura y lectura

- Escritura (comandos: catálogo, carrito, cuentas, compras) contra la **base de escritura**
  (PostgreSQL normalizado, fuente de verdad).
- Lectura (consultas: listados, detalle, búsqueda, historial) contra la **base de lectura**
  (PostgreSQL con modelos desnormalizados por pantalla).
- La sincronización es por **outbox transaccional**: el comando guarda el agregado y sus eventos
  en la misma transacción; un proyector idempotente los aplica a la base de lectura.
- Ningún query handler lee la base de escritura y ningún command handler escribe la de lectura.
  Excepción única: las validaciones de invariantes de un comando leen la base de escritura.
- Las respuestas de los comandos devuelven el estado resultante del agregado para que el cliente
  no dependa del retraso de proyección (read-your-writes).
- El retraso de proyección es una métrica observada y forma parte del health check.

**Razón**: optimizar lectura y escritura por separado y demostrar consistencia eventual controlada.

### IV. Rendimiento: pools de conexiones y caché de lo costoso

- Cada base se accede únicamente a través de un pool configurado (tamaño máximo, timeout de
  adquisición, timeout de inactividad, `statement_timeout`). Prohibido abrir conexiones sueltas.
- Un monitor de pools publica conexiones totales/ocupadas/libres/en espera y el tiempo de
  adquisición, y emite alertas en logs cuando la saturación supera el umbral configurado.
- Las consultas costosas (listados con filtros, facetas, búsqueda, detalle de producto) usan caché
  *cache-aside* en Redis con TTL e invalidación por eventos; el sistema DEBE seguir funcionando
  (degradado) si Redis no está disponible.
- Las imágenes se sirven con `Cache-Control` inmutable y ETag.

### V. Observabilidad desde el día uno

- Endpoints `/health/live` (proceso vivo) y `/health/ready` (bases, Redis, proyector) con detalle
  por componente en JSON.
- Métricas Prometheus en `/metrics`: HTTP (tasa, errores, latencia), pools, caché (hits/misses),
  outbox (pendientes) y retraso del proyector. Grafana con datasource y dashboards provisionados
  como código.
- Logs estructurados en JSON con `requestId` correlacionado de punta a punta.
- Todo error no controlado se registra con contexto y se responde con un formato de error estándar
  (`application/problem+json`).

### VI. Contratos tipados de punta a punta

- TypeScript `strict` en todo el monorepo; `any` prohibido salvo justificación comentada.
- Los contratos HTTP se definen una sola vez con esquemas Zod en `packages/contracts` y se usan
  para validar en el backend y para tipar el frontend.
- Toda entrada externa (HTTP, variables de entorno, archivos subidos) se valida en el borde.

### VII. Frontend por capas: servicios, React Query y componentes

- Las llamadas HTTP se hacen solo con `fetch` a través de un cliente HTTP único (`httpClient`).
- Cada contexto tiene un *service* (`catalogService`, `cartService`, ...) que encapsula endpoints
  y mapeo; los componentes nunca llaman `fetch` directamente.
- El estado del servidor vive en React Query (hooks por caso de uso, query keys centralizadas);
  las mutaciones actualizan la caché con la respuesta del comando.
- Componentes accesibles (roles, labels, foco) y testeados con Testing Library + MSW.

## Restricciones técnicas

- Runtime: Node.js 24 LTS. Backend: TypeScript + Fastify. Frontend: React + Vite + TanStack Query.
- Persistencia: PostgreSQL (escritura y lectura en instancias separadas), Redis para caché.
- Imágenes y archivos subidos se persisten en el backend (almacenamiento propio, no CDNs externos).
- Migraciones versionadas por base; nunca se modifica una migración ya aplicada.
- Todo el entorno local levanta con `docker compose up` (bases, Redis, Prometheus, Grafana).
- Secretos solo por variables de entorno; nunca en el repositorio.
- Seguridad: contraseñas con argon2id, cookies `HttpOnly`/`SameSite`, validación de subida de
  imágenes (tipo real y tamaño), rate limit en autenticación.

## Flujo de desarrollo

- Spec-Driven Development con Spec Kit: `spec.md` → `plan.md` → `tasks.md` → implementación.
  Ningún código se escribe sin una tarea que lo respalde.
- Una rama por feature (`NNN-nombre`), merge a `main` solo con la suite completa en verde,
  lint sin errores y chequeo de arquitectura aprobado.
- Commits pequeños con Conventional Commits; cada tarea de tests se commitea antes o junto con su
  implementación.
- CI (GitHub Actions): typecheck, lint, dependency-cruiser, tests unitarios, de integración
  (contenedores) y build de ambas apps.

## Governance

- Esta constitución prevalece sobre cualquier otra práctica del repositorio.
- Toda enmienda se documenta en este archivo con versión semántica (MAJOR: se elimina o redefine
  un principio; MINOR: se agrega uno o se amplía; PATCH: aclaraciones).
- Cada `plan.md` incluye un *Constitution Check*; las violaciones se justifican en *Complexity
  Tracking* o se rediseña.
- Las revisiones verifican: tests escritos primero, regla de dependencias, separación
  lectura/escritura y métricas para todo componente nuevo de infraestructura.

**Version**: 1.0.0 | **Ratified**: 2026-11-09 | **Last Amended**: 2026-11-09
