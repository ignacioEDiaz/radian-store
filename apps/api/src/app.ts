import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import type { Logger } from './shared/infrastructure/observability/logger.js';
import type { Metrics } from './shared/infrastructure/observability/metrics.js';
import type { HealthService } from './shared/infrastructure/observability/health/health-service.js';
import { registerErrorHandling } from './shared/infrastructure/http/error-handler.js';
import { registerObservability } from './shared/infrastructure/http/observability-routes.js';

export interface AppDeps {
  config: { version: string; webOrigin: string; enableDiagRoutes: boolean; env: string };
  logger: Logger;
  metrics: Metrics;
  health: HealthService;
  /** Pool de lectura para la ruta de diagnóstico (opcional). */
  diagPool?: { query(text: string): Promise<unknown> };
}

/** Un bounded context se integra a la app registrando sus rutas (composition root en main.ts). */
export interface AppModule {
  name: string;
  register(app: FastifyInstance): void | Promise<void>;
}

const REQUEST_ID = /^[\w.:-]{1,100}$/;

export async function buildApp(deps: AppDeps, modules: AppModule[] = []): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: deps.logger as FastifyBaseLogger,
    disableRequestLogging: deps.config.env === 'test',
    requestIdHeader: false,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : globalThis.crypto.randomUUID();
    },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } });
  await app.register(cors, { origin: deps.config.webOrigin, credentials: true });

  registerErrorHandling(app);
  registerObservability(app, deps);

  if (deps.config.enableDiagRoutes && deps.diagPool) {
    const pool = deps.diagPool;
    // Solo para demostrar saturación del pool en Grafana (npm run load:pool).
    app.get('/api/_diag/slow', async () => {
      await pool.query('SELECT pg_sleep(0.2)');
      return { ok: true };
    });
  }

  for (const module of modules) await module.register(app);
  return app;
}
