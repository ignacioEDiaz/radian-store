import { describe, expect, it } from 'vitest';
import { testApp } from '../support/test-app.js';

const REQUIRED = [
  'http_requests_total',
  'http_request_duration_seconds',
  'db_pool_connections',
  'db_pool_max',
  'db_pool_acquire_seconds',
  'db_pool_acquire_timeouts_total',
  'db_pool_errors_total',
  'cache_requests_total',
  'outbox_pending',
  'outbox_failed_total',
  'projection_lag_seconds',
  'projection_events_total',
];

describe('GET /metrics', () => {
  it('expone todas las métricas del contrato en formato Prometheus', async () => {
    const { app } = await testApp();
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    for (const name of REQUIRED) expect(res.body).toContain(`# TYPE ${name} `);
  });

  it('cuenta pedidos HTTP por patrón de ruta, no por URL real', async () => {
    const { app } = await testApp();
    await app.inject({ method: 'GET', url: '/health/live' });
    await app.inject({ method: 'GET', url: '/api/inexistente/123' });
    const body = (await app.inject({ method: 'GET', url: '/metrics' })).body;
    expect(body).toContain('http_requests_total{method="GET",route="/health/live",status="200"} 1');
    expect(body).toContain('route="__not_found__",status="404"');
    expect(body).not.toContain('/api/inexistente/123');
  });

  it('no expone la ruta de diagnóstico salvo que esté habilitada', async () => {
    const off = await testApp();
    expect((await off.app.inject({ method: 'GET', url: '/api/_diag/slow' })).statusCode).toBe(404);
  });
});
