# Research: Plataforma base

## Framework HTTP

- **Decision**: Fastify 5.
- **Rationale**: alto rendimiento, `inject()` para tests de contrato sin red, hooks para métricas y
  `requestId`, ecosistema oficial (cookie, multipart, rate-limit, helmet).
- **Alternatives**: Express (más lento, sin inject nativo), NestJS (opinionado; su DI y módulos
  compiten con la estructura DDD propia y ocultan la arquitectura que se quiere mostrar).

## Acceso a datos

- **Decision**: `pg` (node-postgres) con SQL explícito en repositorios + `node-pg-migrate`.
- **Rationale**: control total del pool (lo que el proyecto quiere demostrar), SQL visible para
  `FOR UPDATE SKIP LOCKED`, `LISTEN/NOTIFY`, índices GIN y `pg_trgm`.
- **Alternatives**: Prisma (pool propio opaco, peor para el monitor), TypeORM (Active Record choca
  con agregados DDD), Kysely (válido, pero agrega una capa sin necesidad).

## Sincronización escritura → lectura

- **Decision**: outbox transaccional + proyector in-process con `LISTEN/NOTIFY` y polling de
  respaldo, checkpoint idempotente por `event_id` en la base de lectura.
- **Rationale**: atomicidad entre estado y evento sin 2PC; latencia sub-segundo; reintentable.
- **Alternatives**: CDC con Debezium (infra pesada), doble escritura (inconsistente ante fallos),
  replicación lógica (no transforma a modelos de lectura).

## Caché

- **Decision**: Redis cache-aside con invalidación por versión de tag, `maxmemory 128mb` +
  `allkeys-lru`, circuit breaker.
- **Rationale**: invalidación O(1) sin escanear claves; expulsión automática ante combinatoria
  de filtros; degradación controlada.
- **Alternatives**: caché en memoria del proceso (no compartida, no sobrevive reinicios),
  borrar por patrón con `SCAN` (costoso y no atómico).

## Métricas, logs y dashboards

- **Decision**: prom-client + Prometheus + Grafana provisionados; pino JSON.
- **Rationale**: estándar de la industria, se versiona como código, sin cuentas externas.
- **Alternatives**: OpenTelemetry completo con collector (más piezas; se deja la puerta abierta
  porque las métricas siguen convenciones compatibles).

## Tests de integración

- **Decision**: Testcontainers (PostgreSQL 17 y Redis 8) con un contenedor por suite y bases
  recreadas por migraciones; `globalSetup` de Vitest.
- **Rationale**: prueba contra motores reales (LISTEN/NOTIFY, SKIP LOCKED, pg_trgm).
- **Alternatives**: pg-mem (no soporta lo anterior), mocks (no prueban SQL).

## Monorepo

- **Decision**: npm workspaces (npm ya instalado), `tsconfig` base compartido, `tsx` para dev,
  `tsc` para build de la API y `vite build` para la web.
- **Alternatives**: pnpm/Turborepo/Nx (no hacen falta para 3 paquetes).

## TypeScript

- **Decision**: TypeScript 6.0.x.
- **Rationale**: typescript-eslint 8 soporta `<6.1`; TS 7 (compilador nativo) aún no es
  compatible con el linter.
