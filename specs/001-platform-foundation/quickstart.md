# Quickstart: Plataforma base

## Requisitos

Docker (con Compose) y Node.js 24.

## Levantar todo

```bash
npm install
npm run dev:infra        # docker compose: write-db, read-db, redis, prometheus, grafana
npm run db:migrate       # migraciones de ambas bases
npm run dev              # API (http://localhost:3000) + web (http://localhost:5173)
```

O todo en contenedores: `docker compose -f infra/docker-compose.yml --profile app up --build`.

## Verificar

```bash
curl -s localhost:3000/health/live
curl -s localhost:3000/health/ready | jq
curl -s localhost:3000/metrics | grep db_pool_connections
```

- Grafana: http://localhost:3001 (admin / admin) → dashboard **Radian Store**.
- Prometheus: http://localhost:9090/targets (target `radian-api` en UP).
- Web: http://localhost:5173/estado muestra el estado de cada componente.

## Escenarios de validación

1. `docker compose stop redis` → `/health/ready` responde 200 `degraded`, `cache.status=down`.
2. `docker compose stop write-db` → 503 `down` en menos de 2 s; `/health/live` sigue 200.
3. `npm run load:pool -w apps/api` (autocannon contra `/api/_diag/slow`, disponible solo con
   `ENABLE_DIAG_ROUTES=true`) → el panel "Pool saturation" sube y aparece el log `pool.saturated`.

## Tests

```bash
npm test                 # unit + contrato de todo el monorepo
npm run test:integration # requiere Docker (Testcontainers)
npm run lint && npm run typecheck && npm run arch
```
