import { describe, expect, it, vi } from 'vitest';
import { RedisCache, type RedisLike } from '../../../../src/shared/infrastructure/cache/redis-cache.js';
import { Metrics } from '../../../../src/shared/infrastructure/observability/metrics.js';
import { silentLogger } from '../../../support/logger.js';

class FakeRedis implements RedisLike {
  store = new Map<string, string>();
  failing = false;
  calls = 0;
  private guard() {
    this.calls += 1;
    if (this.failing) throw new Error('redis caído');
  }
  async get(k: string) {
    this.guard();
    return this.store.get(k) ?? null;
  }
  async mget(...keys: string[]) {
    this.guard();
    return keys.map((k) => this.store.get(k) ?? null);
  }
  async set(k: string, v: string) {
    this.guard();
    this.store.set(k, v);
    return 'OK';
  }
  async incr(k: string) {
    this.guard();
    const n = Number(this.store.get(k) ?? '0') + 1;
    this.store.set(k, String(n));
    return n;
  }
  async ping() {
    this.guard();
    return 'PONG';
  }
}

function setup(now = { t: 0 }) {
  const redis = new FakeRedis();
  const metrics = new Metrics();
  const cache = new RedisCache(redis, metrics, silentLogger, { defaultTtlSeconds: 60, clock: { now: () => new Date(now.t) } });
  return { redis, metrics, cache, now };
}

describe('RedisCache (cache-aside con tags versionados)', () => {
  it('miss → ejecuta el loader y guarda; hit → no ejecuta el loader', async () => {
    const { cache, metrics } = setup();
    const loader = vi.fn(async () => ({ v: 1 }));
    expect(await cache.wrap('q', 'k1', { tags: ['a'] }, loader)).toEqual({ v: 1 });
    expect(await cache.wrap('q', 'k1', { tags: ['a'] }, loader)).toEqual({ v: 1 });
    expect(loader).toHaveBeenCalledTimes(1);
    const text = await metrics.registry.metrics();
    expect(text).toContain('cache_requests_total{name="q",result="miss"} 1');
    expect(text).toContain('cache_requests_total{name="q",result="hit"} 1');
  });

  it('invalidar un tag fuerza recargar solo las entradas con ese tag', async () => {
    const { cache } = setup();
    let n = 0;
    const loader = async () => ++n;
    await cache.wrap('q', 'k-a', { tags: ['a'] }, loader);
    await cache.wrap('q', 'k-b', { tags: ['b'] }, loader);
    await cache.invalidateTags(['a']);
    expect(await cache.wrap('q', 'k-a', { tags: ['a'] }, loader)).toBe(3);
    expect(await cache.wrap('q', 'k-b', { tags: ['b'] }, loader)).toBe(2);
  });

  it('si Redis falla, responde con el loader y cuenta el error', async () => {
    const { cache, redis, metrics } = setup();
    redis.failing = true;
    expect(await cache.wrap('q', 'k', { tags: [] }, async () => 'fresco')).toBe('fresco');
    expect(await metrics.registry.metrics()).toContain('cache_requests_total{name="q",result="error"} 1');
    await expect(cache.invalidateTags(['x'])).resolves.toBeUndefined();
  });

  it('abre el circuito tras 5 errores seguidos y no consulta Redis por 10 s', async () => {
    const { cache, redis, now } = setup();
    redis.failing = true;
    for (let i = 0; i < 5; i += 1) await cache.wrap('q', `k${i}`, { tags: [] }, async () => i);
    const callsWhenOpened = redis.calls;
    await cache.wrap('q', 'otra', { tags: [] }, async () => 0);
    expect(redis.calls).toBe(callsWhenOpened);
    now.t += 10_001;
    redis.failing = false;
    await cache.wrap('q', 'otra', { tags: [] }, async () => 0);
    expect(redis.calls).toBeGreaterThan(callsWhenOpened);
  });

  it('ping propaga el error para el health check', async () => {
    const { cache, redis } = setup();
    redis.failing = true;
    await expect(cache.ping()).rejects.toThrow();
  });
});
