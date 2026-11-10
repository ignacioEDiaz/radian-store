import type { DomainEvent } from '../../domain/domain-event.js';
import type { SqlExecutor } from '../db/pool.js';

export const OUTBOX_CHANNEL = 'outbox_new';

/**
 * Agrega eventos al outbox dentro de la transacción del comando (atomicidad estado + eventos).
 * El NOTIFY se entrega recién al confirmar la transacción.
 */
export async function appendToOutbox(tx: SqlExecutor, events: DomainEvent[]): Promise<void> {
  if (events.length === 0) return;
  const values: unknown[] = [];
  const rows = events.map((e, i) => {
    const o = i * 7;
    values.push(e.eventId, e.type, e.aggregateType, e.aggregateId, e.aggregateVersion, JSON.stringify(e.payload), e.occurredAt);
    return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}::jsonb, $${o + 7})`;
  });
  await tx.query(
    `INSERT INTO outbox (event_id, event_type, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at)
     VALUES ${rows.join(', ')}`,
    values,
  );
  await tx.query(`SELECT pg_notify('${OUTBOX_CHANNEL}', '')`);
}
