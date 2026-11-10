import { describe, expect, it } from 'vitest';
import { HealthService, type HealthCheck } from '../../../../src/shared/infrastructure/observability/health/health-service.js';

const pools = {
  write: { stats: () => ({ total: 1, idle: 1, inUse: 0, waiting: 0, max: 10 }) },
  read: { stats: () => ({ total: 2, idle: 2, inUse: 0, waiting: 0, max: 20 }) },
};

const ok = (): Promise<{ status: 'up' }> => Promise.resolve({ status: 'up' });
const fail = () => Promise.reject(new Error('conexión rechazada'));

function service(overrides: Partial<Record<'writeDb' | 'readDb' | 'cache', HealthCheck>> = {}, projector?: HealthService['projectorCheck']) {
  return new HealthService({
    version: '1.2.3',
    startedAt: new Date(Date.now() - 5000),
    pools,
    timeoutMs: 200,
    checks: { writeDb: ok, readDb: ok, cache: ok, ...overrides },
    projector: projector ?? (async () => ({ status: 'up', lagSeconds: 0, pending: 0 })),
  });
}

describe('HealthService', () => {
  it('live responde ok con versión y uptime', () => {
    const live = service().live();
    expect(live).toMatchObject({ status: 'ok', version: '1.2.3' });
    expect(live.uptimeSeconds).toBeGreaterThanOrEqual(5);
  });

  it('ready ok con todos los componentes arriba, latencias y pools', async () => {
    const r = await service().ready();
    expect(r.status).toBe('ok');
    expect(r.checks.writeDb.status).toBe('up');
    expect(r.checks.readDb.latencyMs).toBeGreaterThanOrEqual(0);
    expect(r.pools.read.max).toBe(20);
  });

  it('down si falla una base, con el detalle del error', async () => {
    const r = await service({ writeDb: fail }).ready();
    expect(r.status).toBe('down');
    expect(r.checks.writeDb).toMatchObject({ status: 'down', detail: 'conexión rechazada' });
  });

  it('degraded si falla la caché', async () => {
    const r = await service({ cache: fail }).ready();
    expect(r.status).toBe('degraded');
    expect(r.checks.cache.status).toBe('down');
  });

  it('degraded si el proyector está atrasado', async () => {
    const r = await service({}, async () => ({ status: 'degraded', lagSeconds: 42, pending: 7, detail: 'atrasado' })).ready();
    expect(r.status).toBe('degraded');
    expect(r.checks.projector).toMatchObject({ lagSeconds: 42, pending: 7 });
  });

  it('un check colgado se corta por timeout y el reporte llega a tiempo', async () => {
    const hang = () => new Promise<never>(() => {});
    const t0 = Date.now();
    const r = await service({ readDb: hang }).ready();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r.checks.readDb).toMatchObject({ status: 'down', detail: expect.stringMatching(/timeout/i) });
    expect(r.status).toBe('down');
  });
});
