# HTTP Contracts: Plataforma

Base URL API: `/api`. Health y métricas fuera de `/api` (para orquestadores y Prometheus).

## GET /health/live

200 `{ "status": "ok", "uptimeSeconds": 12.3, "version": "1.0.0" }`

## GET /health/ready

- 200 con `HealthReport.status` = `ok` | `degraded`
- 503 con `status` = `down`
- `Cache-Control: no-store`. Tiempo máximo de respuesta 2 s.

## GET /metrics

`text/plain; version=0.0.4` (Prometheus exposition). Métricas obligatorias:

| Métrica | Tipo | Labels |
|---------|------|--------|
| http_requests_total | counter | method, route, status |
| http_request_duration_seconds | histogram | method, route |
| db_pool_connections | gauge | pool, state (total/idle/in_use/waiting) |
| db_pool_max | gauge | pool |
| db_pool_acquire_seconds | histogram | pool |
| db_pool_acquire_timeouts_total | counter | pool |
| db_pool_errors_total | counter | pool |
| cache_requests_total | counter | name, result (hit/miss/error) |
| outbox_pending | gauge | — |
| outbox_failed_total | counter | — |
| projection_lag_seconds | gauge | — |
| projection_events_total | counter | type, result |
| + métricas por defecto de proceso Node (`collectDefaultMetrics`) | | |

## Formato de error (todas las rutas)

`Content-Type: application/problem+json`

```json
{
  "type": "https://radian.store/problems/validation",
  "title": "Datos inválidos",
  "status": 400,
  "detail": "La solicitud contiene campos inválidos",
  "instance": "/api/cart/items",
  "requestId": "4f1c…",
  "code": "VALIDATION_ERROR",
  "errors": [{ "path": "quantity", "message": "Debe ser ≤ 10" }]
}
```

Header `x-request-id` en todas las respuestas.
