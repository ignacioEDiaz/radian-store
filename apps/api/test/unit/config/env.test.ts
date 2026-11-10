import { describe, expect, it } from 'vitest';
import { loadConfig, ConfigError } from '../../../src/config/env.js';

const base = {
  WRITE_DATABASE_URL: 'postgres://u:p@localhost:5432/write',
  READ_DATABASE_URL: 'postgres://u:p@localhost:5433/read',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadConfig', () => {
  it('aplica valores por defecto a una configuración mínima válida', () => {
    const config = loadConfig(base);
    expect(config.port).toBe(3000);
    expect(config.db.write.max).toBe(10);
    expect(config.db.read.max).toBe(20);
    expect(config.db.write.acquireTimeoutMs).toBe(5000);
    expect(config.poolMonitor.saturationWarn).toBe(0.8);
    expect(config.enableDiagRoutes).toBe(false);
  });

  it('convierte números y booleanos desde strings', () => {
    const config = loadConfig({ ...base, PORT: '4000', DB_WRITE_POOL_MAX: '3', ENABLE_DIAG_ROUTES: 'true' });
    expect(config.port).toBe(4000);
    expect(config.db.write.max).toBe(3);
    expect(config.enableDiagRoutes).toBe(true);
  });

  it('falla nombrando la variable faltante', () => {
    const { READ_DATABASE_URL: _omit, ...rest } = base;
    expect(() => loadConfig(rest)).toThrow(ConfigError);
    expect(() => loadConfig(rest)).toThrow(/READ_DATABASE_URL/);
  });

  it('exige secretos en producción y usa defaults de desarrollo fuera de ella', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/);
    const dev = loadConfig(base);
    expect(dev.session.secret.length).toBeGreaterThanOrEqual(32);
    expect(dev.session.secureCookie).toBe(false);
    expect(dev.staff).toEqual([]);
    expect(loadConfig({ ...base, VIEWER_EMAIL: 'demo@x.com', VIEWER_PASSWORD: 'demo-password-123' }).staff).toEqual([
      { email: 'demo@x.com', password: 'demo-password-123', role: 'viewer', name: 'Demo (solo lectura)' },
    ]);
    const prod = loadConfig({ ...base, NODE_ENV: 'production', SESSION_SECRET: 's'.repeat(32), COOKIE_SECRET: 'c'.repeat(32) });
    expect(prod.session.secureCookie).toBe(true);
  });

  it('falla nombrando la variable fuera de rango', () => {
    expect(() => loadConfig({ ...base, DB_READ_POOL_MAX: '0' })).toThrow(/DB_READ_POOL_MAX/);
  });
});
