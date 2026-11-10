import { describe, expect, it } from 'vitest';
import { profileSchema } from '@radian/contracts';
import { ORIGIN, cookieFrom, identityApp } from '../../support/identity-context.js';

const json = { 'content-type': 'application/json', origin: ORIGIN };
const user = { name: 'Ana', email: 'ana@example.com', password: 'una-clave-larga' };

describe('POST /api/auth/register', () => {
  it('201 + perfil + cookie de sesión HttpOnly; sin hash en la respuesta', async () => {
    const { app } = await identityApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', headers: json, payload: user });
    expect(res.statusCode).toBe(201);
    expect(profileSchema.parse(res.json())).toMatchObject({ email: 'ana@example.com', role: 'customer' });
    expect(res.body).not.toMatch(/hash|password/i);
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toMatch(/rs_session=/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
  });

  it('409 EMAIL_TAKEN y 400 por contraseña corta con error por campo', async () => {
    const { app } = await identityApp();
    await app.inject({ method: 'POST', url: '/api/auth/register', headers: json, payload: user });
    const dup = await app.inject({ method: 'POST', url: '/api/auth/register', headers: json, payload: { ...user, email: 'ANA@example.com' } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe('EMAIL_TAKEN');
    const short = await app.inject({ method: 'POST', url: '/api/auth/register', headers: json, payload: { ...user, email: 'b@example.com', password: 'corta' } });
    expect(short.statusCode).toBe(400);
    expect(short.json().errors).toEqual([{ path: 'password', message: expect.stringMatching(/10/) }]);
  });

  it('rechaza mutaciones desde otro origen (CSRF)', async () => {
    const { app } = await identityApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', headers: { ...json, origin: 'https://evil.example' }, payload: user });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('BAD_ORIGIN');
  });
});

describe('login / logout / me', () => {
  it('login 200 con cookie; /api/me con la cookie; logout la expira', async () => {
    const { app } = await identityApp();
    await app.inject({ method: 'POST', url: '/api/auth/register', headers: json, payload: user });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: json, payload: { email: user.email, password: user.password } });
    expect(login.statusCode).toBe(200);
    const cookie = cookieFrom(login, 'rs_session')!;
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().name).toBe('Ana');
    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin: ORIGIN } });
    expect(logout.statusCode).toBe(204);
    expect(String(logout.headers['set-cookie'])).toMatch(/rs_session=;.*Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });

  it('401 genérico con credenciales inválidas y 429 con Retry-After tras 5 fallos', async () => {
    const { app } = await identityApp();
    await app.inject({ method: 'POST', url: '/api/auth/register', headers: json, payload: user });
    const bad = () => app.inject({ method: 'POST', url: '/api/auth/login', headers: json, payload: { email: user.email, password: 'mala-clave' } });
    const first = await bad();
    expect(first.statusCode).toBe(401);
    expect(first.json()).toMatchObject({ code: 'INVALID_CREDENTIALS', detail: 'Email o contraseña incorrectos' });
    for (let i = 0; i < 4; i += 1) await bad();
    const blocked = await bad();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBe('900');
  });

  it('PATCH /api/me actualiza y valida la dirección', async () => {
    const { app } = await identityApp();
    const reg = await app.inject({ method: 'POST', url: '/api/auth/register', headers: json, payload: user });
    const cookie = cookieFrom(reg, 'rs_session')!;
    const ok = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { ...json, cookie },
      payload: { name: 'Ana María', defaultAddress: { recipient: 'Ana', line1: 'Calle 123', city: 'Rosario', region: 'Santa Fe', postalCode: '2000', country: 'ar', phone: '341 555 5555' } },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ name: 'Ana María', defaultAddress: { country: 'AR' } });
    const bad = await app.inject({ method: 'PATCH', url: '/api/me', headers: { ...json, cookie }, payload: { defaultAddress: { recipient: 'Ana' } } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().errors.map((e: { path: string }) => e.path)).toContain('defaultAddress.city');
  });
});

describe('guards', () => {
  it('401 sin cookie o con token adulterado; 401 si la cuenta se desactivó; 403 por rol', async () => {
    const { app, repo, context } = await identityApp(({ context }) => [
      {
        name: 'probe',
        register(a) {
          a.get('/api/probe/admin', { preHandler: context.guards.requireRole('admin') }, async () => ({ ok: true }));
        },
      },
    ]);
    void context;
    expect((await app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: 'rs_session=xxx.yyy.zzz' } })).statusCode).toBe(401);

    const reg = await app.inject({ method: 'POST', url: '/api/auth/register', headers: json, payload: user });
    const cookie = cookieFrom(reg, 'rs_session')!;
    const forbidden = await app.inject({ method: 'GET', url: '/api/probe/admin', headers: { cookie } });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().code).toBe('FORBIDDEN');

    const id = reg.json().id as string;
    const c = (await repo.findById(id))!;
    c.deactivate(new Date());
    await repo.save(c);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode).toBe(401);
  });

  it('el admin inicial accede a rutas de administración', async () => {
    const { app } = await identityApp(({ context }) => [
      {
        name: 'probe',
        register(a) {
          a.get('/api/probe/admin', { preHandler: context.guards.requireRole('admin') }, async () => ({ ok: true }));
        },
      },
    ]);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: json,
      payload: { email: 'admin@radian.store', password: 'admin-password-123' },
    });
    expect(login.json().role).toBe('admin');
    const res = await app.inject({ method: 'GET', url: '/api/probe/admin', headers: { cookie: cookieFrom(login, 'rs_session')! } });
    expect(res.statusCode).toBe(200);
  });

  it('cuenta los logins por resultado y no loguea contraseñas', async () => {
    const { app, metrics, logs } = await identityApp();
    await app.inject({ method: 'POST', url: '/api/auth/register', headers: json, payload: user });
    await app.inject({ method: 'POST', url: '/api/auth/login', headers: json, payload: { email: user.email, password: 'mal-mal-mal' } });
    await app.inject({ method: 'POST', url: '/api/auth/login', headers: json, payload: { email: user.email, password: user.password } });
    const text = await metrics.registry.metrics();
    expect(text).toContain('auth_login_total{result="failure"} 1');
    expect(text).toContain('auth_login_total{result="success"} 1');
    expect(JSON.stringify(logs)).not.toContain('una-clave-larga');
  });
});
