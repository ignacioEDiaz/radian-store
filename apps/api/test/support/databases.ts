import { afterAll, beforeAll, inject } from 'vitest';
import { createPool, type DbPool } from '../../src/shared/infrastructure/db/pool.js';
import { Metrics } from '../../src/shared/infrastructure/observability/metrics.js';
import { silentLogger } from './logger.js';

const opts = { max: 5, idleTimeoutMs: 10_000, acquireTimeoutMs: 3000, statementTimeoutMs: 10_000 };

/** Pools contra los contenedores del globalSetup, abiertos/cerrados por suite. */
export function useDatabases() {
  const dbs = {} as { writeDb: DbPool; readDb: DbPool };
  beforeAll(() => {
    const metrics = new Metrics();
    dbs.writeDb = createPool({ name: 'write', url: inject('writeDbUrl'), ...opts }, metrics, silentLogger);
    dbs.readDb = createPool({ name: 'read', url: inject('readDbUrl'), ...opts }, metrics, silentLogger);
  });
  afterAll(async () => {
    await dbs.writeDb.end();
    await dbs.readDb.end();
  });
  return dbs;
}

/** Vacía las tablas indicadas (y el outbox/checkpoints) entre tests. */
export async function truncate(db: DbPool, tables: string[]) {
  await db.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
}
