import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createPool, type DbPool } from '../../../src/shared/infrastructure/db/pool.js';
import { Metrics } from '../../../src/shared/infrastructure/observability/metrics.js';
import { appendToOutbox } from '../../../src/shared/infrastructure/outbox/outbox-writer.js';
import { Projector } from '../../../src/shared/infrastructure/outbox/projector.js';
import type { EventConsumer } from '../../../src/shared/infrastructure/outbox/consumer.js';
import type { DomainEvent } from '../../../src/shared/domain/domain-event.js';
import { NullCache } from '../../../src/shared/infrastructure/cache/null-cache.js';
import { silentLogger } from '../../support/logger.js';

let writeDb: DbPool;
let readDb: DbPool;

const poolOpts = { max: 4, idleTimeoutMs: 10_000, acquireTimeoutMs: 3000, statementTimeoutMs: 5000 };

beforeAll(async () => {
  const metrics = new Metrics();
  writeDb = createPool({ name: 'write', url: inject('writeDbUrl'), ...poolOpts }, metrics, silentLogger);
  readDb = createPool({ name: 'read', url: inject('readDbUrl'), ...poolOpts }, metrics, silentLogger);
  await readDb.query('CREATE TABLE IF NOT EXISTS probe_view (id uuid PRIMARY KEY, name text, hits int)');
  await writeDb.query('CREATE TABLE IF NOT EXISTS probe_policy (id uuid PRIMARY KEY, hits int)');
});

afterAll(async () => {
  await writeDb.end();
  await readDb.end();
});

beforeEach(async () => {
  await writeDb.query('TRUNCATE outbox, consumer_checkpoint, probe_policy');
  await readDb.query('TRUNCATE consumer_checkpoint, probe_view');
});

let seq = 0;
function event(type: string, aggregateId: string, payload: Record<string, unknown>): DomainEvent {
  seq += 1;
  return {
    eventId: crypto.randomUUID(),
    type,
    aggregateType: 'Probe',
    aggregateId,
    aggregateVersion: seq,
    occurredAt: new Date(),
    payload,
  };
}

const projection: EventConsumer = {
  name: 'probe-view',
  target: 'read',
  handles: ['probe.Named'],
  async apply(e, tx) {
    await tx.query(
      `INSERT INTO probe_view (id, name, hits) VALUES ($1, $2, 1)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, hits = probe_view.hits + 1`,
      [e.aggregateId, (e.payload as { name: string }).name],
    );
    return { invalidate: [`probe:${e.aggregateId}`] };
  },
};

function makeProjector(consumers: EventConsumer[], cache = new NullCache()) {
  return new Projector({
    writeDb,
    readDb,
    listenUrl: inject('writeDbUrl'),
    consumers,
    cache,
    metrics: new Metrics(),
    logger: silentLogger,
    pollMs: 5000,
    maxAttempts: 3,
  });
}

describe('Outbox + Projector', () => {
  it('aplica en lectura un evento confirmado en escritura en menos de 1 s (LISTEN/NOTIFY)', async () => {
    const projector = makeProjector([projection]);
    await projector.start();
    const id = crypto.randomUUID();
    const t0 = Date.now();
    await writeDb.withTransaction((tx) => appendToOutbox(tx, [event('probe.Named', id, { name: 'uno' })]));
    let rows: { name: string }[] = [];
    while (Date.now() - t0 < 1000 && rows.length === 0) {
      ({ rows } = await readDb.query<{ name: string }>('SELECT name FROM probe_view WHERE id = $1', [id]));
      await new Promise((r) => setTimeout(r, 20));
    }
    await projector.stop();
    expect(rows[0]?.name).toBe('uno');
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('un rollback no publica eventos', async () => {
    await expect(
      writeDb.withTransaction(async (tx) => {
        await appendToOutbox(tx, [event('probe.Named', crypto.randomUUID(), { name: 'x' })]);
        throw new Error('rollback');
      }),
    ).rejects.toThrow();
    const { rows } = await writeDb.query('SELECT 1 FROM outbox');
    expect(rows).toHaveLength(0);
  });

  it('es idempotente por consumidor: reprocesar no duplica efectos', async () => {
    const id = crypto.randomUUID();
    await writeDb.withTransaction((tx) => appendToOutbox(tx, [event('probe.Named', id, { name: 'a' })]));
    const projector = makeProjector([projection]);
    await projector.runOnce();
    await writeDb.query('UPDATE outbox SET processed_at = NULL');
    await projector.runOnce();
    const { rows } = await readDb.query<{ hits: number }>('SELECT hits FROM probe_view WHERE id = $1', [id]);
    expect(rows[0]!.hits).toBe(1);
  });

  it('una política escribe en write-db y su nuevo evento luego se proyecta', async () => {
    const policy: EventConsumer = {
      name: 'probe-policy',
      target: 'write',
      handles: ['probe.Named'],
      async apply(e, tx) {
        await tx.query('INSERT INTO probe_policy (id, hits) VALUES ($1, 1)', [e.aggregateId]);
        await appendToOutbox(tx, [event('probe.Reacted', e.aggregateId, {})]);
      },
    };
    const reactedProjection: EventConsumer = {
      name: 'probe-reacted',
      target: 'read',
      handles: ['probe.Reacted'],
      async apply(e, tx) {
        await tx.query(`INSERT INTO probe_view (id, name, hits) VALUES ($1, 'reacted', 1)`, [e.aggregateId]);
      },
    };
    const id = crypto.randomUUID();
    await writeDb.withTransaction((tx) => appendToOutbox(tx, [event('probe.Named', id, { name: 'z' })]));
    const projector = makeProjector([policy, reactedProjection]);
    await projector.runOnce();
    await projector.runOnce();
    expect((await writeDb.query('SELECT 1 FROM probe_policy WHERE id = $1', [id])).rows).toHaveLength(1);
    expect((await readDb.query(`SELECT name FROM probe_view WHERE id = $1`, [id])).rows[0]).toEqual({ name: 'reacted' });
  });

  it('si un consumidor falla, el otro no se reaplica en el reintento y tras maxAttempts marca failed_at', async () => {
    let attempts = 0;
    const flaky: EventConsumer = {
      name: 'flaky',
      target: 'read',
      handles: ['probe.Named'],
      async apply() {
        attempts += 1;
        throw new Error('no anda');
      },
    };
    const id = crypto.randomUUID();
    await writeDb.withTransaction((tx) => appendToOutbox(tx, [event('probe.Named', id, { name: 'f' })]));
    const projector = makeProjector([projection, flaky]);
    for (let i = 0; i < 4; i += 1) await projector.runOnce();
    const { rows } = await writeDb.query<{ attempts: number; failed_at: Date | null; last_error: string }>(
      'SELECT attempts, failed_at, last_error FROM outbox',
    );
    expect(rows[0]!.attempts).toBe(3);
    expect(rows[0]!.failed_at).not.toBeNull();
    expect(rows[0]!.last_error).toContain('no anda');
    expect(attempts).toBe(3);
    const view = await readDb.query<{ hits: number }>('SELECT hits FROM probe_view WHERE id = $1', [id]);
    expect(view.rows[0]!.hits).toBe(1);
  });

  it('invalida los tags de caché que devuelven las proyecciones', async () => {
    const invalidated: string[] = [];
    const cache = new NullCache();
    cache.invalidateTags = async (tags: string[]) => {
      invalidated.push(...tags);
    };
    const id = crypto.randomUUID();
    await writeDb.withTransaction((tx) => appendToOutbox(tx, [event('probe.Named', id, { name: 'c' })]));
    await makeProjector([projection], cache).runOnce();
    expect(invalidated).toEqual([`probe:${id}`]);
  });

  it('reporta pendientes y lag', async () => {
    await writeDb.withTransaction((tx) => appendToOutbox(tx, [event('probe.Named', crypto.randomUUID(), { name: 'l' })]));
    const projector = makeProjector([projection]);
    const before = await projector.status();
    expect(before.pending).toBe(1);
    expect(before.lagSeconds).toBeGreaterThanOrEqual(0);
    await projector.runOnce();
    expect(await projector.status()).toEqual({ pending: 0, lagSeconds: 0 });
  });
});
