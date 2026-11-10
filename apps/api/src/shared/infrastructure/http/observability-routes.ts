import type { FastifyInstance } from 'fastify';
import type { HealthService } from '../observability/health/health-service.js';
import type { Metrics } from '../observability/metrics.js';

export function registerObservability(app: FastifyInstance, deps: { metrics: Metrics; health: HealthService }): void {
  // Métricas RED por patrón de ruta (nunca la URL real: evita cardinalidad infinita).
  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions.url ?? '__not_found__';
    if (route === '/metrics') return;
    const labels = { method: req.method, route };
    deps.metrics.httpRequests.inc({ ...labels, status: String(reply.statusCode) });
    deps.metrics.httpDuration.observe(labels, reply.elapsedTime / 1000);
  });

  app.get('/health/live', async (_req, reply) => reply.header('cache-control', 'no-store').send(deps.health.live()));

  app.get('/health/ready', async (_req, reply) => {
    const report = await deps.health.ready();
    return reply
      .status(report.status === 'down' ? 503 : 200)
      .header('cache-control', 'no-store')
      .send(report);
  });

  app.get('/metrics', async (_req, reply) =>
    reply.type(deps.metrics.registry.contentType).send(await deps.metrics.registry.metrics()),
  );
}
