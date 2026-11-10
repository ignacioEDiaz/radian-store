import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createRedisClient, waitForReady } from '../../../src/shared/infrastructure/cache/redis-client.js';
import { RedisCache } from '../../../src/shared/infrastructure/cache/redis-cache.js';
import { Metrics } from '../../../src/shared/infrastructure/observability/metrics.js';
import { silentLogger } from '../../support/logger.js';

const client = createRedisClient(inject('redisUrl'));
beforeAll(async () => {
  expect(await waitForReady(client, 5000)).toBe(true);
});
afterAll(() => client.quit());

describe('RedisCache contra Redis real', () => {
  it('cachea, respeta TTL e invalida por tag', async () => {
    const cache = new RedisCache(client, new Metrics(), silentLogger, { defaultTtlSeconds: 60 });
    let n = 0;
    const key = `k-${crypto.randomUUID()}`;
    expect(await cache.wrap('it', key, { tags: ['it:t'] }, async () => ++n)).toBe(1);
    expect(await cache.wrap('it', key, { tags: ['it:t'] }, async () => ++n)).toBe(1);
    await cache.invalidateTags(['it:t']);
    expect(await cache.wrap('it', key, { tags: ['it:t'] }, async () => ++n)).toBe(2);
    await cache.ping();
  });

  it('expira según el TTL', async () => {
    const cache = new RedisCache(client, new Metrics(), silentLogger, { defaultTtlSeconds: 60 });
    let n = 0;
    const key = `ttl-${crypto.randomUUID()}`;
    await cache.wrap('it', key, { tags: [], ttlSeconds: 1 }, async () => ++n);
    await new Promise((r) => setTimeout(r, 1200));
    expect(await cache.wrap('it', key, { tags: [], ttlSeconds: 1 }, async () => ++n)).toBe(2);
  });
});
