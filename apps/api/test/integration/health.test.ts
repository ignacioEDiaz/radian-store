import { afterEach, describe, expect, inject, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { createInfrastructure, type Infrastructure } from '../../src/infrastructure.js';
import { Metrics } from '../../src/shared/infrastructure/observability/metrics.js';
import { silentLogger } from '../support/logger.js';

let infra: Infrastructure | undefined;
afterEach(async () => {
  await infra?.close();
  infra = undefined;
});

function config(overrides: Record<string, string> = {}) {
  return loadConfig({
    WRITE_DATABASE_URL: inject('writeDbUrl'),
    READ_DATABASE_URL: inject('readDbUrl'),
    REDIS_URL: inject('redisUrl'),
    RUN_PROJECTOR: 'false',
    ...overrides,
  });
}

describe('health con dependencias reales', () => {
  it('ok con bases y Redis arriba', async () => {
    infra = await createInfrastructure(config(), silentLogger, new Metrics(), []);
    await infra.writeDb.query('UPDATE outbox SET processed_at = now() WHERE processed_at IS NULL'); // eventos de otras suites
    const report = await infra.health.ready();
    expect(report.status).toBe('ok');
    expect(report.checks.writeDb.status).toBe('up');
    expect(report.checks.projector).toMatchObject({ status: 'up', pending: 0 });
  });

  it('degraded (y responde rápido) con Redis inalcanzable', async () => {
    infra = await createInfrastructure(config({ REDIS_URL: 'redis://127.0.0.1:1' }), silentLogger, new Metrics(), []);
    const t0 = Date.now();
    const report = await infra.health.ready();
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(report.status).toBe('degraded');
    expect(report.checks.cache.status).toBe('down');
  });

  it('down con la base de lectura inalcanzable', async () => {
    infra = await createInfrastructure(
      config({ READ_DATABASE_URL: 'postgres://x:y@127.0.0.1:1/nope', DB_POOL_ACQUIRE_TIMEOUT_MS: '500' }),
      silentLogger,
      new Metrics(),
      [],
    );
    const report = await infra.health.ready();
    expect(report.status).toBe('down');
    expect(report.checks.readDb.status).toBe('down');
  });
});
