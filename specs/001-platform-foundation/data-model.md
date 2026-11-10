# Data Model: Plataforma base

## Base de escritura (`write-db`)

### `outbox`

| Columna | Tipo | Notas |
|---------|------|-------|
| id | bigserial PK | orden global de procesamiento |
| event_id | uuid UNIQUE | id del evento de dominio |
| event_type | text | p. ej. `catalog.ProductPublished` |
| aggregate_type | text | p. ej. `Product` |
| aggregate_id | uuid | |
| aggregate_version | int | orden por agregado |
| payload | jsonb | datos del evento |
| occurred_at | timestamptz | reloj inyectado |
| processed_at | timestamptz null | |
| attempts | int default 0 | |
| last_error | text null | |
| failed_at | timestamptz null | tras 5 intentos |

Índices: parcial `outbox (id) WHERE processed_at IS NULL AND failed_at IS NULL`.

Trigger/función: no; el `NOTIFY outbox_new` se ejecuta desde `OutboxWriter` dentro de la
transacción (se entrega al confirmar).

### `consumer_checkpoint` (write-db)

Para **políticas** (consumidores que reaccionan a eventos escribiendo en la base de escritura,
p. ej. inventory crea el ítem ante `VariantAdded`, cart se vacía ante `OrderPaid`).

| Columna | Tipo | Notas |
|---------|------|-------|
| consumer | text | nombre estable del consumidor |
| event_id | uuid | |
| applied_at | timestamptz | |

PK `(consumer, event_id)`.

## Base de lectura (`read-db`)

### `consumer_checkpoint` (read-db)

Misma forma, para **proyecciones**. El consumidor aplica su efecto e inserta el checkpoint en la
misma transacción de su base destino; si el checkpoint ya existe, saltea (idempotencia por
consumidor). Un evento del outbox se marca `processed_at` solo cuando **todos** sus consumidores
lo aplicaron; los reintentos no duplican efectos porque cada consumidor verifica su checkpoint.

## Tipos compartidos de dominio (código)

- `DomainEvent<TType, TPayload>`: `{ eventId, type, aggregateType, aggregateId,
  aggregateVersion, occurredAt, payload }`.
- `AggregateRoot`: `id`, `version`, `pullEvents()`, `record(event)`.
- Errores: `DomainError(code)`, `ValidationError(issues)`, `NotFoundError`, `ConflictError`
  (versión), `UnauthorizedError`, `ForbiddenError`, `ServiceUnavailableError`.

## Health Report (respuesta)

```ts
type ComponentStatus = { status: 'up' | 'down' | 'degraded'; latencyMs: number; detail?: string };
type HealthReport = {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptimeSeconds: number;
  checks: { writeDb: ComponentStatus; readDb: ComponentStatus; cache: ComponentStatus;
            projector: ComponentStatus & { lagSeconds: number; pending: number } };
  pools: Record<'write' | 'read', { total: number; idle: number; inUse: number;
            waiting: number; max: number }>;
};
```
