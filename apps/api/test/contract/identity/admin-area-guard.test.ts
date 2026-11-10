import { describe, expect, it } from 'vitest';
import { ORIGIN, cookieFrom, identityApp } from '../../support/identity-context.js';
import type { AppModule } from '../../../src/app.js';

const json = { 'content-type': 'application/json', origin: ORIGIN };

async function appWithProbe() {
  return identityApp(({ context }): AppModule[] => [
    {
      name: 'probe',
      register(a) {
        a.register(async (s) => {
          s.addHook('preHandler', context.guards.requireAdminArea);
          s.get('/api/admin/probe', async () => ({ ok: 'read' }));
          for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) s.route({ method, url: '/api/admin/probe', handler: async () => ({ ok: 'write' }) });
        });
      },
    },
  ]);
}

async function login(app: Awaited<ReturnType<typeof appWithProbe>>['app'], email: string, password: string) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers: json, payload: { email, password } });
  return cookieFrom(res, 'rs_session')!;
}

describe('requireAdminArea', () => {
  it('viewer: puede leer; cualquier modificación → 403 READ_ONLY_ACCOUNT con explicación', async () => {
    const { app } = await appWithProbe();
    const cookie = await login(app, 'demo@radian.store', 'demo-password-123');
    expect((await app.inject({ method: 'GET', url: '/api/admin/probe', headers: { cookie } })).json()).toEqual({ ok: 'read' });
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const res = await app.inject({ method, url: '/api/admin/probe', headers: { ...json, cookie }, payload: {} });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'READ_ONLY_ACCOUNT', detail: expect.stringMatching(/solo lectura/i) });
    }
  });

  it('admin puede todo; cliente → 403 FORBIDDEN; sin sesión → 401', async () => {
    const { app } = await appWithProbe();
    const admin = await login(app, 'admin@radian.store', 'admin-password-123');
    expect((await app.inject({ method: 'POST', url: '/api/admin/probe', headers: { ...json, cookie: admin }, payload: {} })).json()).toEqual({ ok: 'write' });
    const reg = await app.inject({ method: 'POST', url: '/api/auth/register', headers: json, payload: { name: 'Ana', email: 'ana@example.com', password: 'una-clave-larga' } });
    const customer = cookieFrom(reg, 'rs_session')!;
    const forbidden = await app.inject({ method: 'GET', url: '/api/admin/probe', headers: { cookie: customer } });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().code).toBe('FORBIDDEN');
    expect((await app.inject({ method: 'GET', url: '/api/admin/probe' })).statusCode).toBe(401);
  });

  it('el perfil del viewer informa su rol', async () => {
    const { app } = await appWithProbe();
    const cookie = await login(app, 'demo@radian.store', 'demo-password-123');
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json()).toMatchObject({ role: 'viewer' });
  });
});
