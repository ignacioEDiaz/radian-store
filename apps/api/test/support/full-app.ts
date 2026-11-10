import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inject } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { createInfrastructure, type Infrastructure } from '../../src/infrastructure.js';
import { createContexts } from '../../src/modules/index.js';
import { Metrics } from '../../src/shared/infrastructure/observability/metrics.js';
import { silentLogger } from './logger.js';

export const ORIGIN = 'http://localhost:5173';
export const ADMIN = { email: 'admin@radian.store', password: 'admin-password-123' };

/** App completa con el mismo cableado que producción, contra los contenedores del globalSetup. */
export async function fullApp(): Promise<{ app: FastifyInstance; infra: Infrastructure; mediaDir: string; close(): Promise<void> }> {
  const mediaDir = mkdtempSync(path.join(tmpdir(), 'radian-media-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    WRITE_DATABASE_URL: inject('writeDbUrl'),
    READ_DATABASE_URL: inject('readDbUrl'),
    REDIS_URL: inject('redisUrl'),
    RUN_PROJECTOR: 'false',
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    MEDIA_DIR: mediaDir,
    PAYMENT_TIMEOUT_MS: '50',
  });
  const metrics = new Metrics();
  const consumers: Parameters<typeof createInfrastructure>[3] = [];
  const infra = await createInfrastructure(config, silentLogger, metrics, consumers);
  const contexts = createContexts({ config, infra, logger: silentLogger, metrics });
  consumers.push(...contexts.flatMap((c) => c.consumers));
  const app = await buildApp({ config, logger: silentLogger, metrics, health: infra.health }, contexts.map((c) => c.appModule));
  for (const c of contexts) await c.onStart?.();
  await infra.projector.runOnce();
  return {
    app,
    infra,
    mediaDir,
    async close() {
      await app.close();
      for (const c of contexts) await c.stop?.();
      await infra.close();
    },
  };
}

/** Vacía todas las tablas de negocio de ambas bases y la caché (entre tests). */
export async function resetAll(infra: Infrastructure) {
  for (const db of [infra.writeDb, infra.readDb]) {
    const { rows } = await db.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('pgmigrations', 'discount_codes')`,
    );
    if (rows.length) await db.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
  await infra.redis.flushdb();
}

export function sessionCookie(res: LightMyRequestResponse, name = 'rs_session'): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const found = list.find((c) => c.startsWith(`${name}=`));
  if (!found) throw new Error(`No se recibió la cookie ${name}`);
  return found.split(';')[0]!;
}

export async function loginAdmin(app: FastifyInstance): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'content-type': 'application/json', origin: ORIGIN }, payload: ADMIN });
  if (res.statusCode !== 200) throw new Error(`login admin falló: ${res.statusCode} ${res.body}`);
  return sessionCookie(res);
}

/** Cliente JSON con cookie y origen, para escribir tests legibles. */
export function client(app: FastifyInstance, cookie?: string) {
  const headers = { origin: ORIGIN, ...(cookie ? { cookie } : {}) };
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown, extra: Record<string, string> = {}) =>
    app.inject({ method, url, headers: { ...headers, ...(payload !== undefined ? { 'content-type': 'application/json' } : {}), ...extra }, ...(payload !== undefined ? { payload: payload as object } : {}) });
  return {
    get: (url: string, extra?: Record<string, string>) => call('GET', url, undefined, extra),
    post: (url: string, body: unknown = {}, extra?: Record<string, string>) => call('POST', url, body, extra),
    patch: (url: string, body: unknown) => call('PATCH', url, body),
    put: (url: string, body: unknown) => call('PUT', url, body),
    delete: (url: string) => call('DELETE', url),
  };
}

/** Arma un body multipart/form-data con un archivo. */
export function multipartFile(data: Buffer, filename: string, contentType: string) {
  const boundary = `----radian${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}
