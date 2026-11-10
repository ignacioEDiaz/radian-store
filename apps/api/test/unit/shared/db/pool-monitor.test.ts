import { describe, expect, it, vi } from 'vitest';
import { PoolMonitor } from '../../../../src/shared/infrastructure/db/pool-monitor.js';
import { Metrics } from '../../../../src/shared/infrastructure/observability/metrics.js';
import type { PoolStats } from '@radian/contracts';

function fakePool(name: 'write' | 'read', initial: PoolStats) {
  let current = initial;
  return {
    name,
    stats: () => current,
    set(next: Partial<PoolStats>) {
      current = { ...current, ...next };
    },
  };
}

const logger = () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() });

describe('PoolMonitor', () => {
  it('publica gauges por estado y máximo', async () => {
    const metrics = new Metrics();
    const pool = fakePool('write', { total: 4, idle: 1, inUse: 3, waiting: 2, max: 10 });
    new PoolMonitor([pool], metrics, logger(), { intervalMs: 1000, saturationWarn: 0.8 }).sample();
    const text = await metrics.registry.metrics();
    expect(text).toContain('db_pool_connections{pool="write",state="in_use"} 3');
    expect(text).toContain('db_pool_connections{pool="write",state="waiting"} 2');
    expect(text).toContain('db_pool_max{pool="write"} 10');
  });

  it('avisa recién tras 3 muestras saturadas seguidas y una sola vez', () => {
    const log = logger();
    const pool = fakePool('read', { total: 10, idle: 1, inUse: 9, waiting: 0, max: 10 });
    const monitor = new PoolMonitor([pool], new Metrics(), log, { intervalMs: 1000, saturationWarn: 0.8 });
    monitor.sample();
    monitor.sample();
    expect(log.warn).not.toHaveBeenCalled();
    monitor.sample();
    monitor.sample();
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0]![0]).toMatchObject({ event: 'pool.saturated', pool: 'read', saturation: 0.9 });
  });

  it('considera saturado cuando hay pedidos en espera aunque el uso sea bajo', () => {
    const log = logger();
    const pool = fakePool('write', { total: 2, idle: 0, inUse: 2, waiting: 3, max: 10 });
    const monitor = new PoolMonitor([pool], new Metrics(), log, { intervalMs: 1000, saturationWarn: 0.8 });
    monitor.sample();
    monitor.sample();
    monitor.sample();
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('informa la recuperación y reinicia la cuenta si una muestra intermedia es normal', () => {
    const log = logger();
    const pool = fakePool('write', { total: 10, idle: 0, inUse: 10, waiting: 0, max: 10 });
    const monitor = new PoolMonitor([pool], new Metrics(), log, { intervalMs: 1000, saturationWarn: 0.8 });
    monitor.sample();
    monitor.sample();
    pool.set({ inUse: 1, idle: 9 });
    monitor.sample();
    pool.set({ inUse: 10, idle: 0 });
    monitor.sample();
    expect(log.warn).not.toHaveBeenCalled();
    monitor.sample();
    monitor.sample();
    expect(log.warn).toHaveBeenCalledTimes(1);
    pool.set({ inUse: 1, idle: 9 });
    monitor.sample();
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ event: 'pool.recovered', pool: 'write' }), expect.any(String));
  });

  it('start/stop maneja el intervalo', () => {
    vi.useFakeTimers();
    const pool = fakePool('write', { total: 0, idle: 0, inUse: 0, waiting: 0, max: 10 });
    const spy = vi.spyOn(pool, 'stats');
    const monitor = new PoolMonitor([pool], new Metrics(), logger(), { intervalMs: 1000, saturationWarn: 0.8 });
    monitor.start();
    vi.advanceTimersByTime(3000);
    monitor.stop();
    vi.advanceTimersByTime(3000);
    expect(spy).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
