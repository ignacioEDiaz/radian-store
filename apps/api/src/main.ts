import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './config/env.js';
import { createInfrastructure, type Infrastructure } from './infrastructure.js';
import { createContexts, type BoundedContext } from './modules/index.js';
import { createLogger } from './shared/infrastructure/observability/logger.js';
import { Metrics } from './shared/infrastructure/observability/metrics.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const logger = createLogger(config.logLevel);
const metrics = new Metrics({ defaultMetrics: true });

// Los consumidores se registran antes de crear el proyector; los contextos necesitan la infraestructura.
const consumers: BoundedContext['consumers'] = [];
const infra: Infrastructure = await createInfrastructure(config, logger, metrics, consumers);
const contexts = createContexts({ config, infra, logger, metrics });
consumers.push(...contexts.flatMap((c) => c.consumers));

const app = await buildApp(
  { config, logger, metrics, health: infra.health, diagPool: infra.readDb },
  contexts.map((c) => c.appModule),
);

for (const context of contexts) {
  await context.onStart?.().catch((err: unknown) => logger.error({ err }, 'Falló una tarea de arranque'));
}

infra.poolMonitor.start();
if (config.projector.enabled) await infra.projector.start();

await app.listen({ port: config.port, host: config.host });

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Apagado ordenado');
  const force = setTimeout(() => {
    logger.error('El apagado superó 10 s; se fuerza la salida');
    process.exit(1);
  }, 10_000);
  force.unref();
  try {
    await app.close(); // deja de aceptar pedidos y termina los que están en curso
    for (const context of contexts) await context.stop?.();
    await infra.close();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error durante el apagado');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
