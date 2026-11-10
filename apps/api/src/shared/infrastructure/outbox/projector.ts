import pg from 'pg';
import type { Cache } from '../../application/cache.js';
import type { DbPool } from '../db/pool.js';
import type { Metrics } from '../observability/metrics.js';
import type { Logger } from '../observability/logger.js';
import type { EventConsumer, StoredEvent } from './consumer.js';
import { OUTBOX_CHANNEL } from './outbox-writer.js';

export interface ProjectorOptions {
  writeDb: DbPool;
  readDb: DbPool;
  /** URL para la conexión dedicada de LISTEN (fuera del pool). */
  listenUrl: string;
  consumers: EventConsumer[];
  cache: Cache;
  metrics: Metrics;
  logger: Logger;
  pollMs: number;
  batchSize?: number;
  maxAttempts?: number;
}

interface OutboxRow {
  id: string;
  event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  payload: unknown;
  occurred_at: Date;
  attempts: number;
}

/**
 * Sincroniza escritura → lectura. Toma lotes del outbox con FOR UPDATE SKIP LOCKED,
 * entrega cada evento a sus consumidores (idempotentes por checkpoint) y lo marca procesado.
 * Se despierta por NOTIFY y hace polling de respaldo. Ante un fallo detiene el lote para
 * preservar el orden y reintenta en el siguiente ciclo; tras `maxAttempts` lo marca fallido.
 */
export class Projector {
  private listener: pg.Client | undefined;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private rerun = false;
  private stopped = true;

  constructor(private readonly o: ProjectorOptions) {}

  /** Se resuelve en cada lote: los consumidores pueden registrarse después de crear el proyector. */
  private consumersFor(type: string): EventConsumer[] {
    return this.o.consumers.filter((c) => c.handles.includes(type));
  }

  async start(): Promise<void> {
    this.stopped = false;
    try {
      this.listener = new pg.Client({ connectionString: this.o.listenUrl, application_name: 'radian-projector-listen' });
      this.listener.on('notification', () => this.trigger());
      this.listener.on('error', (err) => this.o.logger.warn({ event: 'projector.listen_error', err }, 'LISTEN perdió la conexión'));
      await this.listener.connect();
      await this.listener.query(`LISTEN ${OUTBOX_CHANNEL}`);
    } catch (err) {
      // Sin LISTEN igual funciona por polling.
      this.o.logger.warn({ event: 'projector.listen_unavailable', err }, 'Proyector sin LISTEN, sigue por polling');
      this.listener = undefined;
    }
    this.timer = setInterval(() => this.trigger(), this.o.pollMs);
    this.timer.unref();
    this.trigger();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
    await this.listener?.end().catch(() => undefined);
    this.listener = undefined;
  }

  /** Dispara un ciclo; si ya hay uno corriendo, agenda otro al terminar (sin solapamientos). */
  private trigger(): void {
    if (this.stopped) return;
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = (async () => {
      do {
        this.rerun = false;
        try {
          while ((await this.runOnce()) === (this.o.batchSize ?? 100) && !this.stopped);
        } catch (err) {
          this.o.logger.error({ event: 'projector.cycle_error', err }, 'Ciclo del proyector falló');
        }
      } while (this.rerun && !this.stopped);
    })().finally(() => {
      this.running = undefined;
    });
  }

  /** Procesa un lote. Devuelve cuántos eventos quedaron procesados. */
  async runOnce(): Promise<number> {
    const batchSize = this.o.batchSize ?? 100;
    const maxAttempts = this.o.maxAttempts ?? 5;
    const tags = new Set<string>();

    const processed = await this.o.writeDb.withTransaction(async (lockTx) => {
      const { rows } = await lockTx.query<OutboxRow>(
        `SELECT id, event_id, event_type, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at, attempts
           FROM outbox
          WHERE processed_at IS NULL AND failed_at IS NULL
          ORDER BY id
          LIMIT $1
          FOR UPDATE SKIP LOCKED`,
        [batchSize],
      );
      let count = 0;
      for (const row of rows) {
        const event = toEvent(row);
        try {
          for (const consumer of this.consumersFor(event.type)) {
            const result = await this.applyConsumer(consumer, event);
            result?.invalidate?.forEach((t) => tags.add(t));
          }
          await lockTx.query('UPDATE outbox SET processed_at = now(), attempts = attempts + 1 WHERE id = $1', [row.id]);
          this.o.metrics.projectionEvents.inc({ type: event.type, result: 'ok' });
          count += 1;
        } catch (err) {
          const attempts = row.attempts + 1;
          const failed = attempts >= maxAttempts;
          await lockTx.query(
            `UPDATE outbox SET attempts = $2, last_error = $3, failed_at = CASE WHEN $4 THEN now() END WHERE id = $1`,
            [row.id, attempts, err instanceof Error ? `${err.name}: ${err.message}` : String(err), failed],
          );
          this.o.metrics.projectionEvents.inc({ type: event.type, result: 'error' });
          if (failed) {
            this.o.metrics.outboxFailed.inc();
            this.o.logger.error({ event: 'projector.event_failed', eventType: event.type, eventId: event.eventId, err }, 'Evento descartado tras agotar reintentos');
            count += 1;
            continue;
          }
          this.o.logger.warn({ event: 'projector.event_retry', eventType: event.type, attempts, err }, 'Fallo al aplicar evento; se reintentará');
          break; // preserva el orden: no se avanza más allá de un evento fallido
        }
      }
      return count;
    });

    if (tags.size) await this.o.cache.invalidateTags([...tags]);
    await this.status();
    return processed;
  }

  private async applyConsumer(consumer: EventConsumer, event: StoredEvent) {
    const db = consumer.target === 'read' ? this.o.readDb : this.o.writeDb;
    return db.withTransaction(async (tx) => {
      const { rowCount } = await tx.query(
        'INSERT INTO consumer_checkpoint (consumer, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [consumer.name, event.eventId],
      );
      if (rowCount === 0) return undefined; // ya aplicado: idempotencia
      return (await consumer.apply(event, tx)) ?? undefined;
    });
  }

  /** Pendientes y antigüedad del más viejo (para health y métricas). */
  async status(): Promise<{ pending: number; lagSeconds: number }> {
    const { rows } = await this.o.writeDb.query<{ pending: string; lag: number | null }>(
      `SELECT count(*) AS pending, extract(epoch FROM now() - min(occurred_at))::float AS lag
         FROM outbox WHERE processed_at IS NULL AND failed_at IS NULL`,
    );
    const pending = Number(rows[0]?.pending ?? 0);
    const lagSeconds = pending === 0 ? 0 : Math.max(0, Math.round((rows[0]?.lag ?? 0) * 1000) / 1000);
    this.o.metrics.outboxPending.set(pending);
    this.o.metrics.projectionLag.set(lagSeconds);
    return { pending, lagSeconds };
  }
}

function toEvent(row: OutboxRow): StoredEvent {
  return {
    position: row.id,
    eventId: row.event_id,
    type: row.event_type,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: row.aggregate_version,
    occurredAt: row.occurred_at,
    payload: row.payload,
  };
}
