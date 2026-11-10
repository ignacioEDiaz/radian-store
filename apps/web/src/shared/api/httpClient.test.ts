import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { z } from 'zod';
import { server } from '../../test/server';
import { ApiError, createHttpClient } from './httpClient';

const api = createHttpClient({ baseUrl: 'http://api.test', timeoutMs: 200 });

describe('httpClient', () => {
  it('envía y recibe JSON con credenciales incluidas', async () => {
    let seen: { body: unknown; contentType: string | null } | undefined;
    server.use(
      http.post('http://api.test/api/things', async ({ request }) => {
        seen = { body: await request.json(), contentType: request.headers.get('content-type') };
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(api.post('/api/things', { name: 'x' })).resolves.toEqual({ id: 1 });
    expect(seen).toEqual({ body: { name: 'x' }, contentType: 'application/json' });
    expect(spy.mock.calls[0]![1]).toMatchObject({ credentials: 'include', method: 'POST' });
    spy.mockRestore();
  });

  it('arma la query string ignorando undefined y repitiendo arrays', async () => {
    let url = '';
    server.use(
      http.get('http://api.test/api/list', ({ request }) => {
        url = request.url;
        return HttpResponse.json([]);
      }),
    );
    await api.get('/api/list', { query: { color: ['Black', 'Red'], page: 2, q: undefined } });
    expect(url).toBe('http://api.test/api/list?color=Black&color=Red&page=2');
  });

  it('204 devuelve undefined', async () => {
    server.use(http.delete('http://api.test/api/x', () => new HttpResponse(null, { status: 204 })));
    await expect(api.delete('/api/x')).resolves.toBeUndefined();
  });

  it('convierte problem+json en ApiError tipado', async () => {
    server.use(
      http.post('http://api.test/api/cart', () =>
        HttpResponse.json(
          { type: 't', title: 'Operación no permitida', status: 422, code: 'INSUFFICIENT_STOCK', detail: 'Solo quedan 2', meta: { available: 2 } },
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );
    const err = await api.post('/api/cart', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: 'INSUFFICIENT_STOCK', message: 'Solo quedan 2' });
    expect((err as ApiError).problem?.meta).toEqual({ available: 2 });
  });

  it('error de red → ApiError NETWORK_ERROR', async () => {
    server.use(http.get('http://api.test/api/down', () => HttpResponse.error()));
    await expect(api.get('/api/down')).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });

  it('corta por timeout', async () => {
    server.use(
      http.get('http://api.test/api/slow', async () => {
        await delay(1000);
        return HttpResponse.json({});
      }),
    );
    await expect(api.get('/api/slow')).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('valida la respuesta con el esquema del contrato si se pasa', async () => {
    server.use(http.get('http://api.test/api/typed', () => HttpResponse.json({ id: 'no-es-numero' })));
    await expect(api.get('/api/typed', { schema: z.object({ id: z.number() }) })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('acepta estados no-2xx declarados (p. ej. 503 de health) devolviendo el cuerpo', async () => {
    server.use(http.get('http://api.test/health/ready', () => HttpResponse.json({ status: 'down' }, { status: 503 })));
    await expect(api.get('/health/ready', { acceptStatus: [503] })).resolves.toEqual({ status: 'down' });
  });
});
