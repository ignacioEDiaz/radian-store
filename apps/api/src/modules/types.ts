import type { AppModule } from '../app.js';
import type { AppConfig } from '../config/env.js';
import type { Infrastructure } from '../infrastructure.js';
import type { EventConsumer } from '../shared/infrastructure/outbox/consumer.js';
import type { Logger } from '../shared/infrastructure/observability/logger.js';
import type { Metrics } from '../shared/infrastructure/observability/metrics.js';

export interface ModuleContext {
  config: AppConfig;
  infra: Pick<Infrastructure, 'writeDb' | 'readDb' | 'cache' | 'redis'>;
  logger: Logger;
  metrics: Metrics;
}

export interface BoundedContext {
  appModule: AppModule;
  /** Proyecciones y políticas que este contexto aporta al proyector. */
  consumers: EventConsumer[];
  /** Tareas a ejecutar al arrancar (p. ej. crear el admin inicial). */
  onStart?(): Promise<void>;
  /** Jobs periódicos a detener en el apagado. */
  stop?(): Promise<void> | void;
}
