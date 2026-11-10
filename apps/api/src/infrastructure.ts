import type { AppConfig } from './config/env.js';
import type { Cache } from './shared/application/cache.js';
import { createPool, type DbPool } from './shared/infrastructure/db/pool.js';
import { PoolMonitor } from './shared/infrastructure/db/pool-monitor.js';
import { createRedisClient, waitForReady } from './shared/infrastructure/cache/redis-client.js';
import { RedisCache } from './shared/infrastructure/cache/redis-cache.js';
import { Projector } from './shared/infrastructure/outbox/projector.js';
import type { EventConsumer } from './shared/infrastructure/outbox/consumer.js';
import { HealthService } from './shared/infrastructure/observability/health/health-service.js';
import type { Logger } from './shared/infrastructure/observability/logger.js';
import type { Metrics } from './shared/infrastructure/observability/metrics.js';

export interface Infrastructure {
  writeDb: DbPool;
  readDb: DbPool;
  cache: Cache;
  projector: Projector;
  poolMonitor: PoolMonitor;
  health: HealthService;
  close(): Promise<void>;
}

/**
 * Crea los adaptadores compartidos. No falla si una dependencia todavía no está disponible:
 * la app arranca y /health/ready informa el estado hasta que se recupere.
 */
export async function createInfrastructure(
  config: AppConfig,
  logger: Logger,
  metrics: Metrics,
  consumers: EventConsumer[],
): Promise<Infrastructure> {
  const writeDb = createPool({ name: 'write', ...config.db.write }, metrics, logger);
  const readDb = createPool({ name: 'read', ...config.db.read }, metrics, logger);

  const redis = createRedisClient(config.redisUrl);
  if (!(await waitForReady(redis, 2000))) {
    logger.warn({ event: 'cache.unavailable_at_startup' }, 'Redis no disponible al arrancar: se opera sin caché');
  }
  const cache = new RedisCache(redis, metrics, logger, { defaultTtlSeconds: config.cache.defaultTtlSeconds });

  const projector = new Projector({
    writeDb,
    readDb,
    listenUrl: config.db.write.url,
    consumers,
    cache,
    metrics,
    logger,
    pollMs: config.projector.pollMs,
  });

  const poolMonitor = new PoolMonitor([writeDb, readDb], metrics, logger, config.poolMonitor);

  const ping = (db: DbPool) => async () => {
    await db.query('SELECT 1');
    return { status: 'up' as const };
  };
  const health = new HealthService({
    version: config.version,
    startedAt: new Date(),
    pools: { write: writeDb, read: readDb },
    timeoutMs: 1500,
    checks: {
      writeDb: ping(writeDb),
      readDb: ping(readDb),
      cache: async () => {
        await cache.ping();
        return { status: 'up' };
      },
    },
    projector: async () => {
      const { pending, lagSeconds } = await projector.status();
      const lagging = lagSeconds > config.projector.lagWarnSeconds;
      return {
        status: lagging ? 'degraded' : 'up',
        pending,
        lagSeconds,
        ...(lagging ? { detail: `Atraso de ${lagSeconds}s (umbral ${config.projector.lagWarnSeconds}s)` } : {}),
      };
    },
  });

  return {
    writeDb,
    readDb,
    cache,
    projector,
    poolMonitor,
    health,
    async close() {
      poolMonitor.stop();
      await projector.stop();
      await Promise.allSettled([writeDb.end(), readDb.end(), redis.quit().catch(() => redis.disconnect())]);
    },
  };
}
