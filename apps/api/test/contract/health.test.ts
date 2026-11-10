import { describe, expect, it } from 'vitest';
import { healthLiveSchema, healthReportSchema } from '@radian/contracts';
import { fakeHealth, testApp } from '../support/test-app.js';

describe('GET /health/*', () => {
  it('/health/live cumple el contrato', async () => {
    const { app } = await testApp();
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(healthLiveSchema.parse(res.json())).toBeTruthy();
  });

  it('/health/ready ok → 200, sin caché y cumple el contrato', async () => {
    const { app } = await testApp();
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(healthReportSchema.parse(res.json()).status).toBe('ok');
  });

  it('/health/ready con base caída → 503 down', async () => {
    const health = fakeHealth({
      checks: {
        writeDb: async () => {
          throw new Error('ECONNREFUSED');
        },
        readDb: async () => ({ status: 'up' }),
        cache: async () => ({ status: 'up' }),
      },
    });
    const { app } = await testApp({ health });
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(healthReportSchema.parse(res.json()).status).toBe('down');
  });

  it('/health/ready degradado → 200 degraded', async () => {
    const health = fakeHealth({
      checks: {
        writeDb: async () => ({ status: 'up' }),
        readDb: async () => ({ status: 'up' }),
        cache: async () => {
          throw new Error('redis');
        },
      },
    });
    const { app } = await testApp({ health });
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('degraded');
  });
});
