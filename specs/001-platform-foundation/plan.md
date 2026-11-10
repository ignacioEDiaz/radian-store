# Implementation Plan: Plataforma base, salud y observabilidad

**Branch**: `001-platform-foundation` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-platform-foundation/spec.md`

## Summary

Monorepo npm workspaces con API (Fastify + TypeScript), web (React + Vite + React Query) y
contratos compartidos (Zod). Dos PostgreSQL (escritura/lectura) con migraciones independientes,
Redis para caché, outbox transaccional + proyector con `LISTEN/NOTIFY`, pools `pg` instrumentados
con un monitor de saturación, `/health/live`, `/health/ready`, `/metrics` (prom-client) y
Prometheus + Grafana provisionados en `docker compose`. Esta feature define la arquitectura que el
resto de features reutiliza.

## Technical Context

**Language/Version**: TypeScript 6.0 (`strict`), Node.js 24 LTS

**Primary Dependencies**: API: fastify 5, @fastify/cookie, @fastify/helmet, @fastify/cors,
@fastify/rate-limit, pg 8, ioredis 6, prom-client 15, pino 10, zod 4. Web: react 19,
react-router 8, @tanstack/react-query 5, vite 8. Herramientas: vitest 5, testcontainers 12,
msw 3, @testing-library/react 16, eslint 10 + typescript-eslint 8, dependency-cruiser 18, tsx.

**Storage**: PostgreSQL 17 ×2 (`write-db`, `read-db`), Redis 8 (caché, LRU con `maxmemory`).

**Testing**: Vitest (unit + integración con Testcontainers + contrato con `fastify.inject`),
Testing Library + MSW en la web.

**Target Platform**: contenedores Linux (docker compose) y desarrollo local Windows/Linux/macOS.

**Project Type**: web application (API + SPA) en monorepo.

**Performance Goals**: `/health/ready` < 2 s siempre; proyección p95 < 1 s.

**Constraints**: ninguna petición espera conexión más de `DB_POOL_ACQUIRE_TIMEOUT_MS` (5 s).

**Scale/Scope**: demo de portafolio; una instancia por servicio, ~50 productos, decenas de
usuarios concurrentes simulados.

## Constitution Check

| Principio | Cumplimiento |
|-----------|--------------|
| I. TDD | Cada tarea de implementación está precedida por su tarea de test (ver tasks.md). Cobertura con umbrales en `vitest.config.ts`. |
| II. DDD/hexagonal | `src/shared/{domain,application,infrastructure}` + `src/modules/<context>/{domain,application,infrastructure}`; dependency-cruiser verifica la regla. |
| III. CQRS | `writeDb` y `readDb` son pools distintos; `CommandBus`/`QueryBus` con tipos que solo inyectan el pool correspondiente; outbox + proyector. |
| IV. Pools y caché | `createPool()` es la única forma de obtener conexiones; `PoolMonitor`; `Cache` cache-aside con tags y fallback. |
| V. Observabilidad | health, métricas, logs pino con `requestId`, problem+json, dashboards provisionados. |
| VI. Contratos | `packages/contracts` con Zod; config validada con Zod. |
| VII. Frontend por capas | `httpClient` (fetch) → `services/` → hooks React Query → componentes. |

Resultado: **PASS** (sin violaciones). Re-evaluado tras el diseño: **PASS**.

## Project Structure

### Documentation (this feature)

```text
specs/001-platform-foundation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── http.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/
├── api/
│   ├── src/
│   │   ├── main.ts                    # arranque HTTP + proyector + monitor
│   │   ├── projector-main.ts          # punto de entrada separable del proyector
│   │   ├── app.ts                     # buildApp(deps) para tests y main
│   │   ├── config/                    # env.ts (Zod)
│   │   ├── shared/
│   │   │   ├── domain/                # AggregateRoot, DomainEvent, Entity, ValueObject, errors, Result
│   │   │   ├── application/           # CommandBus, QueryBus, ports (Clock, IdGenerator, UnitOfWork)
│   │   │   └── infrastructure/
│   │   │       ├── db/                # pool.ts, pool-monitor.ts, transaction.ts, migrate.ts
│   │   │       ├── outbox/            # outbox-writer.ts, projector.ts, projection-registry.ts
│   │   │       ├── cache/             # redis-cache.ts, cache-port, tags
│   │   │       ├── observability/     # metrics.ts, logger.ts, health/
│   │   │       └── http/              # error-handler.ts (problem+json), request-id, plugins
│   │   └── modules/                   # bounded contexts (features 002–006)
│   ├── migrations/
│   │   ├── write/                     # node-pg-migrate, base de escritura
│   │   └── read/                      # node-pg-migrate, base de lectura
│   └── test/
│       ├── unit/ integration/ contract/
│       └── support/                   # containers.ts, builders, fakes
├── web/
│   └── src/
│       ├── app/                       # providers (QueryClient), router, layout
│       ├── shared/api/                # httpClient.ts (fetch), problem.ts, queryKeys.ts
│       ├── shared/ui/                 # componentes base
│       ├── features/<context>/        # services/, hooks/, components/, pages/
│       └── test/                      # msw handlers, render helpers
packages/
└── contracts/src/                     # esquemas Zod por contexto + tipos inferidos
infra/
├── docker-compose.yml
├── prometheus/prometheus.yml
└── grafana/provisioning/{datasources,dashboards}/ + dashboards/radian-store.json
.github/workflows/ci.yml
.dependency-cruiser.cjs
```

**Structure Decision**: monorepo con `apps/api`, `apps/web`, `packages/contracts` e `infra/`. La
API organiza el código por bounded context con capas hexagonales; la web por feature con capa de
servicios.

## Diseño clave

### Pools (`shared/infrastructure/db/pool.ts`)

- `createPool({ name: 'write' | 'read', url, max, idleTimeoutMs, acquireTimeoutMs,
  statementTimeoutMs, metrics, logger })` envuelve `pg.Pool`:
  - `connectionTimeoutMillis = acquireTimeoutMs`, `statement_timeout` y
    `idle_in_transaction_session_timeout` por conexión, `application_name = radian-api-<name>`.
  - `query()` y `withClient()` miden tiempo de adquisición (histograma
    `db_pool_acquire_seconds{pool}`) y cuentan timeouts (`db_pool_acquire_timeouts_total`) que se
    traducen a `ServiceUnavailableError` (503).
  - Escucha `error` del pool (conexión idle rota) → log + `db_pool_errors_total`.
- `PoolMonitor` (intervalo configurable, 5 s): gauges `db_pool_connections{pool,state=total|idle|
  in_use|waiting}`, `db_pool_max{pool}`; calcula saturación `in_use/max`; tras 3 muestras sobre
  `DB_POOL_SATURATION_WARN` (0.8) o con `waiting > 0` emite `pool.saturated` (warn) y luego
  `pool.recovered` (info). Es testeable con un reloj y un pool falsos.
- Tamaños por defecto: write `max=10`, read `max=20` (más lecturas que escrituras).

### Transacciones y outbox

- `UnitOfWork.run(fn)` abre transacción en `writeDb`; los repositorios reciben el `client` de la
  transacción. `OutboxWriter.append(client, events)` inserta en `outbox` en la misma transacción y
  ejecuta `NOTIFY outbox_new`.
- `Projector`: escucha `LISTEN outbox_new` con una conexión dedicada (fuera del pool) y hace
  polling de respaldo cada 1 s. Toma lotes con
  `SELECT ... FROM outbox WHERE processed_at IS NULL ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED`,
  y entrega cada evento a sus **consumidores** registrados: *proyecciones* (escriben en `readDb`)
  y *políticas* (reaccionan escribiendo en `writeDb`, p. ej. crear inventario o vaciar carrito,
  pudiendo emitir nuevos eventos al outbox). Cada consumidor corre en una transacción de su base
  destino que inserta `consumer_checkpoint(consumer, event_id)` (si ya existe ⇒ saltea:
  idempotencia). Con todos aplicados se marca `processed_at`. Tras aplicar, invalida los tags de
  caché que declara cada proyección.
  Reintentos con backoff; tras 5 fallos el evento queda con `failed_at` y error (métrica
  `outbox_failed_total`).
- Métricas: `outbox_pending` (gauge), `projection_lag_seconds` (now − created_at del más viejo
  pendiente), `projection_events_total{type,result}`.

### Caché

- Puerto `Cache` (`get`, `set`, `wrap(key, ttl, tags, loader)`, `invalidateTags(tags)`).
- Implementación Redis con versionado de tags: la clave efectiva incluye la versión de cada tag
  (`tag:<name>` → entero); invalidar = `INCR` del tag (O(1), sin `KEYS`).
- Si Redis falla: se registra, se cuenta `cache_errors_total` y se ejecuta el loader (degradado).
  Circuit breaker simple (abre 10 s tras 5 errores seguidos) para no sumar latencia.
- Métricas `cache_requests_total{result=hit|miss|error, name}`.

### Health

- `/health/live`: `{status:'ok', uptimeSeconds, version}` siempre 200 si el proceso atiende.
- `/health/ready`: corre en paralelo los checks con `Promise.race` contra 2 s:
  `writeDb` (`SELECT 1`), `readDb`, `cache` (`PING`), `projector` (lag < `PROJECTION_LAG_WARN_S`).
  Estado global: `down` (503) si falla alguna base; `degraded` (200) si falla caché o hay lag;
  `ok` (200). Incluye estadísticas de pools.

### HTTP

- `requestId` desde `x-request-id` o generado; se devuelve en la respuesta y se agrega al logger.
- Error handler: `DomainError` → 409/422, `ValidationError` (Zod) → 400 con `errors[]`,
  `NotFoundError` → 404, `UnauthorizedError` → 401, `ForbiddenError` → 403,
  `ServiceUnavailableError` → 503, otros → 500 genérico. Formato RFC 9457.
- Métricas HTTP: `http_requests_total{method,route,status}` y
  `http_request_duration_seconds{method,route}` (route = patrón, no URL real).
- Apagado ordenado con `SIGTERM/SIGINT`: `app.close()` → proyector → monitor → pools → Redis,
  con tope de 10 s.

### Web

- `httpClient`: wrapper de `fetch` con `baseUrl`, `credentials: 'include'`, JSON, timeout con
  `AbortController`, parseo de `problem+json` a `ApiError` tipado, validación opcional de
  respuesta con el esquema Zod del contrato.
- `QueryClient` con `staleTime` 30 s, reintentos solo para errores de red/5xx, y
  `queryKeys` centralizadas.
- Página `/estado` (diagnóstico) que consume `/health/ready` vía `systemService` y `useHealth()`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Dos bases PostgreSQL | Requisito explícito de CQRS con base de escritura y de lectura | Una sola base con vistas no demuestra la separación ni permite escalar lecturas |
| Proyector con LISTEN/NOTIFY + polling | Latencia < 1 s sin broker externo | Un broker (Kafka/RabbitMQ) agrega infraestructura sin beneficio a esta escala |
