import type { PoolStats } from '@radian/contracts';
import type { Metrics } from '../observability/metrics.js';
import type { Logger } from '../observability/logger.js';

export interface MonitoredPool {
  readonly name: string;
  stats(): PoolStats;
}

export interface PoolMonitorOptions {
  intervalMs: number;
  /** Fracción de uso (inUse / max) a partir de la cual se considera saturado. */
  saturationWarn: number;
  /** Muestras seguidas necesarias para avisar. */
  consecutiveSamples?: number;
}

type MonitorLogger = Pick<Logger, 'warn' | 'info'>;

/**
 * Muestrea los pools, publica gauges y avisa por log cuando la saturación se sostiene.
 * Avisa una vez al entrar en saturación y otra al recuperarse (sin spam).
 */
export class PoolMonitor {
  private timer: NodeJS.Timeout | undefined;
  private readonly state = new Map<string, { streak: number; alerted: boolean }>();

  constructor(
    private readonly pools: MonitoredPool[],
    private readonly metrics: Metrics,
    private readonly logger: MonitorLogger,
    private readonly options: PoolMonitorOptions,
  ) {}

  start(): void {
    this.stop();
    this.timer = setInterval(() => this.sample(), this.options.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  sample(): void {
    const needed = this.options.consecutiveSamples ?? 3;
    for (const pool of this.pools) {
      const s = pool.stats();
      const label = { pool: pool.name };
      this.metrics.poolConnections.set({ ...label, state: 'total' }, s.total);
      this.metrics.poolConnections.set({ ...label, state: 'idle' }, s.idle);
      this.metrics.poolConnections.set({ ...label, state: 'in_use' }, s.inUse);
      this.metrics.poolConnections.set({ ...label, state: 'waiting' }, s.waiting);
      this.metrics.poolMax.set(label, s.max);

      const saturation = s.max > 0 ? s.inUse / s.max : 0;
      const saturated = saturation >= this.options.saturationWarn || s.waiting > 0;
      const st = this.state.get(pool.name) ?? { streak: 0, alerted: false };

      if (saturated) {
        st.streak += 1;
        if (st.streak >= needed && !st.alerted) {
          st.alerted = true;
          this.logger.warn(
            { event: 'pool.saturated', pool: pool.name, saturation: round(saturation), ...s },
            `Pool "${pool.name}" saturado`,
          );
        }
      } else {
        if (st.alerted) {
          this.logger.info({ event: 'pool.recovered', pool: pool.name, saturation: round(saturation), ...s }, `Pool "${pool.name}" recuperado`);
        }
        st.streak = 0;
        st.alerted = false;
      }
      this.state.set(pool.name, st);
    }
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
