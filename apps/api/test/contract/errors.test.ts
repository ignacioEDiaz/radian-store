import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { problemSchema } from '@radian/contracts';
import { testApp } from '../support/test-app.js';
import { parseBody } from '../../src/shared/infrastructure/http/validation.js';
import { DomainError, NotFoundError, ServiceUnavailableError } from '../../src/shared/domain/errors.js';
import type { AppModule } from '../../src/app.js';

const probe: AppModule = {
  name: 'probe',
  register(app) {
    app.post('/api/probe/validate', async (req) => parseBody(z.object({ quantity: z.number().max(10) }), req.body));
    app.get('/api/probe/missing', async () => {
      throw new NotFoundError('THING_NOT_FOUND', 'No existe');
    });
    app.get('/api/probe/rule', async () => {
      throw new DomainError('OUT_OF_STOCK', 'Sin stock', { available: 2 });
    });
    app.get('/api/probe/unavailable', async () => {
      throw new ServiceUnavailableError('DB_POOL_TIMEOUT', 'Base saturada');
    });
    app.get('/api/probe/boom', async () => {
      throw new Error('detalle interno secreto');
    });
  },
};

describe('errores problem+json', () => {
  it('400 con errores por campo', async () => {
    const { app } = await testApp({ modules: [probe] });
    const res = await app.inject({ method: 'POST', url: '/api/probe/validate', payload: { quantity: 11 } });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const body = problemSchema.parse(res.json());
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.errors).toEqual([{ path: 'quantity', message: expect.any(String) }]);
    expect(body.instance).toBe('/api/probe/validate');
  });

  it('404 de dominio, de ruta inexistente, 422 de regla con meta y 503', async () => {
    const { app } = await testApp({ modules: [probe] });
    const missing = await app.inject({ method: 'GET', url: '/api/probe/missing' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe('THING_NOT_FOUND');
    const noRoute = await app.inject({ method: 'GET', url: '/api/no-existe' });
    expect(noRoute.statusCode).toBe(404);
    expect(noRoute.json().code).toBe('ROUTE_NOT_FOUND');
    const rule = await app.inject({ method: 'GET', url: '/api/probe/rule' });
    expect(rule.statusCode).toBe(422);
    expect(rule.json()).toMatchObject({ code: 'OUT_OF_STOCK', meta: { available: 2 } });
    const unavailable = await app.inject({ method: 'GET', url: '/api/probe/unavailable' });
    expect(unavailable.statusCode).toBe(503);
  });

  it('500 genérico sin filtrar detalles y log con requestId y causa', async () => {
    const { app, logs } = await testApp({ modules: [probe] });
    const res = await app.inject({ method: 'GET', url: '/api/probe/boom', headers: { 'x-request-id': 'req-123' } });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secreto');
    expect(res.json()).toMatchObject({ code: 'INTERNAL_ERROR', requestId: 'req-123' });
    expect(res.headers['x-request-id']).toBe('req-123');
    const errorLog = logs.find((l) => l['level'] === 'error');
    expect(errorLog).toMatchObject({ reqId: 'req-123' });
    expect(JSON.stringify(errorLog)).toContain('detalle interno secreto');
  });

  it('genera x-request-id si no viene', async () => {
    const { app } = await testApp();
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
