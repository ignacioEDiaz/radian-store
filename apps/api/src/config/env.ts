import { z } from 'zod';

const int = (def: number, min = 0) => z.coerce.number().int().min(min).default(def);
const bool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(def ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: int(3000, 1),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_VERSION: z.string().default('1.0.0'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  WRITE_DATABASE_URL: z.string().min(1),
  READ_DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  DB_WRITE_POOL_MAX: int(10, 1),
  DB_READ_POOL_MAX: int(20, 1),
  DB_POOL_IDLE_TIMEOUT_MS: int(30_000, 1000),
  DB_POOL_ACQUIRE_TIMEOUT_MS: int(5000, 100),
  DB_STATEMENT_TIMEOUT_MS: int(10_000, 100),
  POOL_MONITOR_INTERVAL_MS: int(5000, 100),
  DB_POOL_SATURATION_WARN: z.coerce.number().min(0.1).max(1).default(0.8),
  PROJECTION_LAG_WARN_S: z.coerce.number().positive().default(5),
  PROJECTOR_POLL_MS: int(1000, 50),
  CACHE_DEFAULT_TTL_S: int(300, 1),
  ENABLE_DIAG_ROUTES: bool(false),
  RUN_PROJECTOR: bool(true),
});

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new ConfigError(`Configuración inválida:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const pool = (url: string, max: number) => ({
    url,
    max,
    idleTimeoutMs: e.DB_POOL_IDLE_TIMEOUT_MS,
    acquireTimeoutMs: e.DB_POOL_ACQUIRE_TIMEOUT_MS,
    statementTimeoutMs: e.DB_STATEMENT_TIMEOUT_MS,
  });
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    version: e.APP_VERSION,
    webOrigin: e.WEB_ORIGIN,
    db: {
      write: pool(e.WRITE_DATABASE_URL, e.DB_WRITE_POOL_MAX),
      read: pool(e.READ_DATABASE_URL, e.DB_READ_POOL_MAX),
    },
    redisUrl: e.REDIS_URL,
    poolMonitor: { intervalMs: e.POOL_MONITOR_INTERVAL_MS, saturationWarn: e.DB_POOL_SATURATION_WARN },
    projector: { pollMs: e.PROJECTOR_POLL_MS, lagWarnSeconds: e.PROJECTION_LAG_WARN_S, enabled: e.RUN_PROJECTOR },
    cache: { defaultTtlSeconds: e.CACHE_DEFAULT_TTL_S },
    enableDiagRoutes: e.ENABLE_DIAG_ROUTES,
  };
}
