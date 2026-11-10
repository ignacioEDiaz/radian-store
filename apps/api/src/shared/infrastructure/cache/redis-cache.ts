import type { Cache, CacheOptions } from '../../application/cache.js';
import type { Clock } from '../../application/ports.js';
import { systemClock } from '../../application/ports.js';
import type { Metrics } from '../observability/metrics.js';
import type { Logger } from '../observability/logger.js';

/** Subconjunto de comandos Redis que usa la caché (facilita tests con un fake). */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  ping(): Promise<string>;
}

interface Options {
  defaultTtlSeconds: number;
  clock?: Clock;
  breakerThreshold?: number;
  breakerOpenMs?: number;
}

const ENTRY = 'cache:entry:';
const TAG = 'cache:tag:';

/**
 * Cache-aside con invalidación por versión de tag:
 * la clave efectiva incluye la versión actual de cada tag, así invalidar es un INCR (O(1))
 * y las entradas viejas quedan inalcanzables hasta que expiran (LRU/TTL).
 * Si Redis falla se usa el loader; tras N fallos seguidos un circuit breaker evita sumar latencia.
 */
export class RedisCache implements Cache {
  private consecutiveErrors = 0;
  private openUntil = 0;
  private readonly clock: Clock;

  constructor(
    private readonly redis: RedisLike,
    private readonly metrics: Metrics,
    private readonly logger: Pick<Logger, 'warn'>,
    private readonly options: Options,
  ) {
    this.clock = options.clock ?? systemClock;
  }

  async wrap<T>(name: string, key: string, options: CacheOptions, loader: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      this.metrics.cacheRequests.inc({ name, result: 'error' });
      return loader();
    }
    let entryKey: string;
    try {
      entryKey = await this.versionedKey(key, options.tags);
      const cached = await this.redis.get(entryKey);
      this.succeeded();
      if (cached !== null) {
        this.metrics.cacheRequests.inc({ name, result: 'hit' });
        return JSON.parse(cached) as T;
      }
    } catch (err) {
      this.failed(err);
      this.metrics.cacheRequests.inc({ name, result: 'error' });
      return loader();
    }
    this.metrics.cacheRequests.inc({ name, result: 'miss' });
    const value = await loader();
    try {
      await this.redis.set(entryKey, JSON.stringify(value), 'EX', options.ttlSeconds ?? this.options.defaultTtlSeconds);
      this.succeeded();
    } catch (err) {
      this.failed(err);
    }
    return value;
  }

  async invalidateTags(tags: string[]): Promise<void> {
    if (tags.length === 0) return;
    try {
      await Promise.all([...new Set(tags)].map((t) => this.redis.incr(TAG + t)));
      this.succeeded();
    } catch (err) {
      // Si no se pudo invalidar, el TTL acota la ventana de datos viejos.
      this.failed(err);
    }
  }

  async ping(): Promise<void> {
    await this.redis.ping();
  }

  private async versionedKey(key: string, tags: string[]): Promise<string> {
    if (tags.length === 0) return ENTRY + key;
    const sorted = [...new Set(tags)].sort();
    const versions = await this.redis.mget(...sorted.map((t) => TAG + t));
    return `${ENTRY}${key}|${versions.map((v) => v ?? '0').join('.')}`;
  }

  private isOpen(): boolean {
    return this.clock.now().getTime() < this.openUntil;
  }

  private succeeded(): void {
    this.consecutiveErrors = 0;
  }

  private failed(err: unknown): void {
    this.consecutiveErrors += 1;
    if (this.consecutiveErrors >= (this.options.breakerThreshold ?? 5)) {
      this.openUntil = this.clock.now().getTime() + (this.options.breakerOpenMs ?? 10_000);
      this.consecutiveErrors = 0;
      this.logger.warn({ event: 'cache.circuit_open', err }, 'Caché no disponible: se omite temporalmente');
    }
  }
}
