/**
 * Proyector como proceso independiente (para escalar API y proyector por separado).
 * Usar con RUN_PROJECTOR=false en la API.
 */
import Fastify from 'fastify';
import { loadConfig } from './config/env.js';
import { createInfrastructure } from './infrastructure.js';
import { createContexts, type BoundedContext } from './modules/index.js';
import { createLogger } from './shared/infrastructure/observability/logger.js';
import { Metrics } from './shared/infrastructure/observability/metrics.js';

const config = loadConfig();
const logger = createLogger(config.logLevel).child({ component: 'projector' });
const metrics = new Metrics({ defaultMetrics: true });
const consumers: BoundedContext['consumers'] = [];
const infra = await createInfrastructure(config, logger, metrics, consumers);
consumers.push(...createContexts({ config, infra, logger, metrics }).flatMap((c) => c.consumers));

await infra.projector.start();
infra.poolMonitor.start();

// Endpoint mínimo de métricas para que Prometheus también lo scrapee.
const server = Fastify();
server.get('/metrics', async (_req, reply) => reply.type(metrics.registry.contentType).send(await metrics.registry.metrics()));
await server.listen({ port: config.port + 1, host: config.host });

const stop = async () => {
  await server.close();
  await infra.close();
  process.exit(0);
};
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
