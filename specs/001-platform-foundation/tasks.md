---
description: "Task list for 001-platform-foundation"
---

# Tasks: Plataforma base, salud y observabilidad

**Input**: Design documents from `/specs/001-platform-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http.md

**Tests**: OBLIGATORIOS (Constitución I, TDD). Cada test se escribe y se ve fallar antes de su
implementación.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 Crear monorepo: `package.json` raíz con workspaces `apps/*`, `packages/*`, scripts (`dev`, `dev:infra`, `db:migrate`, `test`, `test:integration`, `lint`, `typecheck`, `arch`, `build`), `.gitignore`, `.editorconfig`, `.nvmrc` (24)
- [x] T002 [P] `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) y `tsconfig.json` por paquete
- [x] T003 [P] ESLint flat config (`eslint.config.js`) con typescript-eslint y react-hooks; Prettier
- [x] T004 [P] Paquete `packages/contracts` (zod) con `src/index.ts`, `problem.ts`, `health.ts`
- [x] T005 [P] App `apps/api` (fastify, pg, ioredis, prom-client, pino, zod, node-pg-migrate, vitest, testcontainers) con `vitest.config.ts` (proyectos unit/integration, umbrales de cobertura)
- [x] T006 [P] App `apps/web` (Vite + React + React Query + React Router, Vitest + jsdom + Testing Library + MSW)
- [x] T007 [P] `infra/docker-compose.yml`: `write-db` y `read-db` (postgres:17, healthchecks, volúmenes), `redis` (redis:8, `maxmemory 128mb allkeys-lru`), `prometheus`, `grafana`; perfil `app` con `api` y `web`
- [x] T008 [P] `.dependency-cruiser.cjs` con reglas: `domain` no importa `application/infrastructure/fastify/pg/ioredis`; `application` no importa `infrastructure`; módulos no importan el `domain` de otros módulos
- [x] T009 [P] `.github/workflows/ci.yml`: install, typecheck, lint, arch, test, test:integration, build

## Phase 2: Foundational

- [x] T010 [P] Test unit `apps/api/test/unit/config/env.test.ts`: config válida/inválida (mensaje con la variable)
- [x] T011 Implementar `apps/api/src/config/env.ts` (Zod)
- [x] T012 [P] Tests unit `test/unit/shared/domain/*.test.ts`: `AggregateRoot` registra y vacía eventos, incrementa versión; `Money`; errores
- [x] T013 Implementar `src/shared/domain/` (aggregate-root, domain-event, entity, errors, money, result)
- [x] T014 [P] Tests unit `test/unit/shared/application/buses.test.ts`: `CommandBus`/`QueryBus` despachan al handler registrado y fallan si no hay handler
- [x] T015 Implementar `src/shared/application/` (command-bus, query-bus, ports: clock, id-generator, unit-of-work)
- [x] T016 Migraciones iniciales `migrations/write/0001_outbox.ts` (outbox + consumer_checkpoint) y `migrations/read/0001_consumer_checkpoint.ts` + `src/shared/infrastructure/db/migrate.ts` (por base)
- [x] T017 Soporte de tests `test/support/containers.ts` (globalSetup: levanta Postgres×2 y Redis con Testcontainers, aplica migraciones, expone URLs)

## Phase 3: User Story 2 - Salud del sistema (P1) 🎯

**Goal**: `/health/live` y `/health/ready` con detalle por componente.

### Tests

- [x] T018 [P] [US2] Test unit `test/unit/shared/observability/health-service.test.ts`: agregación ok/degraded/down, timeout de 2 s con check colgado, lag del proyector
- [x] T019 [P] [US2] Test contrato `test/contract/health.test.ts` (`app.inject`): forma de `/health/live` y `/health/ready` contra esquema de `packages/contracts`, 503 cuando un check de base falla
- [x] T020 [P] [US2] Test integración `test/integration/health.test.ts`: con contenedores reales `ok`; deteniendo Redis → `degraded`

### Implementation

- [x] T021 [US2] `src/shared/infrastructure/observability/health/` (health-service, checks: postgres, redis, projector)
- [x] T022 [US2] `src/shared/infrastructure/http/` (request-id, error-handler problem+json) y `src/app.ts` (`buildApp(deps)`) con rutas de health
- [x] T023 [US2] `src/main.ts` con arranque, apagado ordenado (SIGTERM/SIGINT, tope 10 s) y arranque aunque las dependencias no estén listas

## Phase 4: User Story 4 - Pools monitoreados (P2)

### Tests

- [x] T024 [P] [US4] Test unit `test/unit/shared/db/pool-monitor.test.ts`: con pool falso y reloj falso, aviso tras 3 muestras saturadas, aviso de recuperación, gauges publicados
- [x] T025 [P] [US4] Test integración `test/integration/db/pool.test.ts`: pool max=2 con 6 consultas `pg_sleep` concurrentes → `waiting` > 0, timeout de adquisición → `ServiceUnavailableError` y contador incrementado; `statement_timeout` corta consultas largas

### Implementation

- [x] T026 [US4] `src/shared/infrastructure/db/pool.ts` (`createPool`, `query`, `withClient`, métricas de adquisición, errores)
- [x] T027 [US4] `src/shared/infrastructure/db/pool-monitor.ts`
- [x] T028 [US4] `src/shared/infrastructure/db/unit-of-work.ts` (transacción en writeDb)

## Phase 5: Outbox, proyector y caché (fundacional para CQRS)

### Tests

- [x] T029 [P] Test integración `test/integration/outbox/projector.test.ts`: evento escrito en transacción → aplicado en lectura < 1 s vía NOTIFY; reaplicar el mismo evento no duplica (checkpoint por consumidor); una política que escribe en write-db y emite un evento nuevo que luego se proyecta; si un consumidor falla, el otro no se reaplica en el reintento; rollback no publica; tras 5 fallos marca `failed_at`
- [x] T030 [P] Test unit `test/unit/shared/cache/tagged-cache.test.ts` (Redis falso en memoria): hit/miss, invalidación por tag, fallback cuando el cliente falla, circuit breaker
- [x] T031 [P] Test integración `test/integration/cache/redis-cache.test.ts` contra Redis real

### Implementation

- [x] T032 `src/shared/infrastructure/outbox/` (outbox-writer, projector, projection-registry con tags de caché a invalidar)
- [x] T033 `src/shared/infrastructure/cache/` (cache port en `shared/application/ports/cache.ts`, redis-cache, circuit-breaker)
- [x] T034 `src/projector-main.ts` (proceso separable)

## Phase 6: User Story 5 - Errores y trazabilidad (P3)

- [x] T035 [P] [US5] Test contrato `test/contract/errors.test.ts`: 400 con `errors[]`, 404 de ruta inexistente, 500 sin detalles internos, `x-request-id` propagado y presente en logs (logger con destino en memoria)
- [x] T036 [US5] Ajustes en error-handler y logger (`src/shared/infrastructure/observability/logger.ts`) hasta pasar T035

## Phase 7: User Story 3 - Dashboards (P2)

- [x] T037 [P] [US3] Test contrato `test/contract/metrics.test.ts`: `/metrics` expone todas las métricas de la tabla del contrato
- [x] T038 [US3] `src/shared/infrastructure/observability/metrics.ts` (registry, métricas HTTP con hook onResponse usando `routeOptions.url`)
- [x] T039 [US3] `infra/prometheus/prometheus.yml` (scrape `api:3000/metrics` cada 5 s) y provisioning de Grafana (datasource + dashboard `radian-store.json`: RED HTTP, pools, caché, outbox/lag, proceso)
- [x] T040 [US3] Ruta de diagnóstico `GET /api/_diag/slow` (solo con `ENABLE_DIAG_ROUTES`) y script `load:pool` (autocannon)

## Phase 8: User Story 1 - Entorno con un comando (P1) + base web

### Tests

- [x] T041 [P] [US1] Test web `apps/web/src/shared/api/httpClient.test.ts` (MSW): JSON, `credentials: include`, parseo de problem+json a `ApiError`, timeout
- [x] T042 [P] [US1] Test web `apps/web/src/features/system/StatusPage.test.tsx`: muestra estado por componente y estado de error con reintento

### Implementation

- [x] T043 [US1] `apps/web/src/shared/api/` (httpClient, ApiError, queryKeys) y `src/app/` (QueryClientProvider, router, Layout con header/footer de la marca)
- [x] T044 [US1] `apps/web/src/features/system/` (systemService, useHealth, StatusPage en `/estado`)
- [ ] T045 [US1] Dockerfiles `apps/api/Dockerfile` y `apps/web/Dockerfile` (multi-stage; web servida por nginx con proxy `/api` y `/media`)
- [x] T046 [US1] `README.md` raíz con arquitectura (diagrama), comandos y capturas de Grafana

## Phase 9: Polish

- [x] T047 Ejecutar `npm run lint && npm run typecheck && npm run arch && npm test && npm run test:integration` en verde
- [ ] T048 Validar quickstart.md de punta a punta

## Dependencies

- Setup (T001–T009) → Foundational (T010–T017) → US2, US4, Outbox/caché (pueden ir en paralelo) → US5 → US3 → US1 → Polish.
- T021 depende de T026 (checks usan pools) y T032 (lag del proyector): se implementa con puertos y se cablea en T023.
