import type { LoginAttemptLimiter } from '../../application/ports.js';

/** Comandos Redis necesarios (permite un fake en tests). */
export interface CounterStore {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  get(key: string): Promise<string | null>;
  ttl(key: string): Promise<number>;
  del(key: string): Promise<number>;
}

interface Options {
  max: number;
  windowSeconds: number;
  now?: () => number;
}

const PREFIX = 'auth:login-fail:';

/**
 * Cuenta fallos de login por (email, ip) en una ventana fija.
 * Si Redis no está disponible, sigue protegiendo con un contador en memoria del proceso.
 */
export class LoginRateLimiter implements LoginAttemptLimiter {
  private readonly memory = new Map<string, { count: number; resetAt: number }>();
  private readonly now: () => number;

  constructor(private readonly store: CounterStore, private readonly o: Options) {
    this.now = o.now ?? Date.now;
  }

  async check(key: string) {
    try {
      const count = Number((await this.store.get(PREFIX + key)) ?? 0);
      if (count < this.o.max) return { blocked: false, retryAfterSeconds: 0 };
      const ttl = await this.store.ttl(PREFIX + key);
      return { blocked: true, retryAfterSeconds: ttl > 0 ? ttl : this.o.windowSeconds };
    } catch {
      const entry = this.memoryEntry(key);
      const blocked = (entry?.count ?? 0) >= this.o.max;
      return { blocked, retryAfterSeconds: blocked && entry ? Math.ceil((entry.resetAt - this.now()) / 1000) : 0 };
    }
  }

  async recordFailure(key: string) {
    try {
      const count = await this.store.incr(PREFIX + key);
      if (count === 1) await this.store.expire(PREFIX + key, this.o.windowSeconds);
    } catch {
      const entry = this.memoryEntry(key) ?? { count: 0, resetAt: this.now() + this.o.windowSeconds * 1000 };
      entry.count += 1;
      this.memory.set(key, entry);
    }
  }

  async reset(key: string) {
    this.memory.delete(key);
    await this.store.del(PREFIX + key).catch(() => undefined);
  }

  private memoryEntry(key: string) {
    const entry = this.memory.get(key);
    if (entry && entry.resetAt <= this.now()) {
      this.memory.delete(key);
      return undefined;
    }
    return entry;
  }
}
