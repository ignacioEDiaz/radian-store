import type { ComponentStatus, HealthLive, HealthReport, PoolStats } from '@radian/contracts';

export type CheckResult = { status: 'up' | 'degraded' | 'down'; detail?: string };
export type HealthCheck = () => Promise<CheckResult>;
export type ProjectorCheck = () => Promise<CheckResult & { lagSeconds: number; pending: number }>;

export interface HealthServiceOptions {
  version: string;
  startedAt: Date;
  pools: Record<'write' | 'read', { stats(): PoolStats }>;
  checks: Record<'writeDb' | 'readDb' | 'cache', HealthCheck>;
  projector: ProjectorCheck;
  /** Tiempo máximo por check; el reporte completo queda acotado por este valor. */
  timeoutMs?: number;
}

export class HealthService {
  readonly projectorCheck: ProjectorCheck;

  constructor(private readonly o: HealthServiceOptions) {
    this.projectorCheck = o.projector;
  }

  live(): HealthLive {
    return { status: 'ok', uptimeSeconds: this.uptime(), version: this.o.version };
  }

  async ready(): Promise<HealthReport> {
    const timeoutMs = this.o.timeoutMs ?? 1500;
    const [writeDb, readDb, cache, projector] = await Promise.all([
      timed(this.o.checks.writeDb, timeoutMs),
      timed(this.o.checks.readDb, timeoutMs),
      timed(this.o.checks.cache, timeoutMs),
      timed(this.o.projector, timeoutMs),
    ]);

    const { lagSeconds = 0, pending = 0, ...projectorStatus } = projector as ComponentStatus & { lagSeconds?: number; pending?: number };
    const status: HealthReport['status'] =
      writeDb.status === 'down' || readDb.status === 'down'
        ? 'down'
        : cache.status !== 'up' || projectorStatus.status !== 'up'
          ? 'degraded'
          : 'ok';

    return {
      status,
      version: this.o.version,
      uptimeSeconds: this.uptime(),
      checks: { writeDb, readDb, cache, projector: { ...projectorStatus, lagSeconds, pending } },
      pools: { write: this.o.pools.write.stats(), read: this.o.pools.read.stats() },
    };
  }

  private uptime(): number {
    return Math.round((Date.now() - this.o.startedAt.getTime()) / 100) / 10;
  }
}

async function timed<T extends CheckResult>(check: () => Promise<T>, timeoutMs: number): Promise<ComponentStatus & Partial<T>> {
  const t0 = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout tras ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
    return { ...result, latencyMs: elapsed(t0) };
  } catch (err) {
    return { status: 'down', latencyMs: elapsed(t0), detail: err instanceof Error ? err.message : String(err) } as ComponentStatus & Partial<T>;
  } finally {
    clearTimeout(timer);
  }
}

const elapsed = (t0: number) => Math.round((performance.now() - t0) * 10) / 10;
