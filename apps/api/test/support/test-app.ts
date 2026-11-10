import { Writable } from 'node:stream';
import { buildApp, type AppModule } from '../../src/app.js';
import { HealthService } from '../../src/shared/infrastructure/observability/health/health-service.js';
import { Metrics } from '../../src/shared/infrastructure/observability/metrics.js';
import { createLogger } from '../../src/shared/infrastructure/observability/logger.js';

export function memoryLogger() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      for (const line of String(chunk).split('\n').filter(Boolean)) lines.push(JSON.parse(line));
      cb();
    },
  });
  return { logger: createLogger('info', stream), lines };
}

export function fakeHealth(overrides: Partial<ConstructorParameters<typeof HealthService>[0]> = {}) {
  const stats = () => ({ total: 0, idle: 0, inUse: 0, waiting: 0, max: 10 });
  return new HealthService({
    version: 'test',
    startedAt: new Date(),
    pools: { write: { stats }, read: { stats } },
    timeoutMs: 500,
    checks: {
      writeDb: async () => ({ status: 'up' }),
      readDb: async () => ({ status: 'up' }),
      cache: async () => ({ status: 'up' }),
    },
    projector: async () => ({ status: 'up', lagSeconds: 0, pending: 0 }),
    ...overrides,
  });
}

export async function testApp(options: { modules?: AppModule[]; health?: HealthService; enableDiagRoutes?: boolean } = {}) {
  const { logger, lines } = memoryLogger();
  const metrics = new Metrics();
  const app = await buildApp(
    {
      config: { version: 'test', webOrigin: 'http://localhost:5173', enableDiagRoutes: options.enableDiagRoutes ?? false, env: 'test' },
      logger,
      metrics,
      health: options.health ?? fakeHealth(),
    },
    options.modules ?? [],
  );
  return { app, logs: lines, metrics };
}
