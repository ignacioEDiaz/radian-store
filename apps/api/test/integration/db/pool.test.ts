import { afterEach, describe, expect, inject, it } from 'vitest';
import { createPool, type DbPool } from '../../../src/shared/infrastructure/db/pool.js';
import { Metrics } from '../../../src/shared/infrastructure/observability/metrics.js';
import { ServiceUnavailableError } from '../../../src/shared/domain/errors.js';
import { silentLogger } from '../../support/logger.js';

let pool: DbPool | undefined;
afterEach(async () => {
  await pool?.end();
  pool = undefined;
});

function make(overrides: Partial<Parameters<typeof createPool>[0]> = {}, metrics = new Metrics()) {
  pool = createPool(
    {
      name: 'write',
      url: inject('writeDbUrl'),
      max: 2,
      idleTimeoutMs: 10_000,
      acquireTimeoutMs: 2_000,
      statementTimeoutMs: 5_000,
      ...overrides,
    },
    metrics,
    silentLogger,
  );
  return pool;
}

describe('createPool (PostgreSQL real)', () => {
  it('ejecuta consultas y reporta estadísticas', async () => {
    const p = make();
    const { rows } = await p.query<{ one: number }>('SELECT 1 AS one');
    expect(rows[0]!.one).toBe(1);
    expect(p.stats()).toMatchObject({ max: 2, waiting: 0 });
  });

  it('pone en cola lo que excede el máximo y lo publica como waiting', async () => {
    const p = make();
    const running = Array.from({ length: 6 }, () => p.query('SELECT pg_sleep(0.3)'));
    await new Promise((r) => setTimeout(r, 100));
    const stats = p.stats();
    expect(stats.inUse).toBe(2);
    expect(stats.waiting).toBe(4);
    await Promise.all(running);
    expect(p.stats().waiting).toBe(0);
  });

  it('falla con ServiceUnavailableError si no consigue conexión a tiempo y lo cuenta', async () => {
    const metrics = new Metrics();
    const p = make({ max: 1, acquireTimeoutMs: 200 }, metrics);
    const blocker = p.query('SELECT pg_sleep(1)');
    await expect(p.query('SELECT 1')).rejects.toBeInstanceOf(ServiceUnavailableError);
    await blocker;
    expect(await metrics.registry.metrics()).toContain('db_pool_acquire_timeouts_total{pool="write"} 1');
  });

  it('corta sentencias que superan statement_timeout', async () => {
    const p = make({ statementTimeoutMs: 200 });
    await expect(p.query('SELECT pg_sleep(2)')).rejects.toThrow(/statement timeout/);
  });

  it('withTransaction confirma o revierte', async () => {
    const p = make();
    await p.query('CREATE TABLE IF NOT EXISTS tx_probe (v int)');
    await p.query('TRUNCATE tx_probe');
    await p.withTransaction((c) => c.query('INSERT INTO tx_probe VALUES (1)'));
    await expect(
      p.withTransaction(async (c) => {
        await c.query('INSERT INTO tx_probe VALUES (2)');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const { rows } = await p.query<{ v: number }>('SELECT v FROM tx_probe');
    expect(rows.map((r) => r.v)).toEqual([1]);
  });

  it('si PostgreSQL corta una conexión en uso, el proceso no se cae: falla esa operación y el pool sigue sirviendo', async () => {
    const metrics = new Metrics();
    // idle_in_transaction_session_timeout = 2 × statement_timeout = 300 ms
    const p = make({ statementTimeoutMs: 150 }, metrics);
    await expect(
      p.withTransaction(async (client) => {
        await client.query('SELECT 1');
        // La transacción queda abierta sin actividad más de lo permitido: el servidor la termina.
        await new Promise((r) => setTimeout(r, 700));
        await client.query('SELECT 1');
      }),
    ).rejects.toThrow();
    const { rows } = await p.query<{ one: number }>('SELECT 1 AS one');
    expect(rows[0]!.one).toBe(1);
    expect(await metrics.registry.metrics()).toMatch(/db_pool_errors_total\{pool="write"\} [1-9]/);
  });

  it('registra el tiempo de adquisición en el histograma', async () => {
    const metrics = new Metrics();
    const p = make({}, metrics);
    await p.query('SELECT 1');
    expect(await metrics.registry.metrics()).toMatch(/db_pool_acquire_seconds_count\{pool="write"\} [1-9]/);
  });
});
