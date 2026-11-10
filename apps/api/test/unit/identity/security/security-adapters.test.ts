import { describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from '../../../../src/modules/identity/infrastructure/security/argon2-password-hasher.js';
import { JwtTokenIssuer } from '../../../../src/modules/identity/infrastructure/security/jwt-token-issuer.js';
import { LoginRateLimiter, type CounterStore } from '../../../../src/modules/identity/infrastructure/security/login-rate-limiter.js';

describe('Argon2PasswordHasher', () => {
  it('genera hashes argon2id verificables y distintos para la misma clave', async () => {
    const hasher = new Argon2PasswordHasher({ memoryCost: 1024, timeCost: 1 });
    const a = await hasher.hash('una-clave-larga');
    const b = await hasher.hash('una-clave-larga');
    expect(a).toMatch(/^\$argon2id\$/);
    expect(a).not.toBe(b);
    expect(await hasher.verify(a, 'una-clave-larga')).toBe(true);
    expect(await hasher.verify(a, 'otra')).toBe(false);
    expect(await hasher.verify('basura', 'x')).toBe(false);
  });
});

describe('JwtTokenIssuer', () => {
  const secret = 'x'.repeat(32);
  it('emite y verifica claims', async () => {
    const issuer = new JwtTokenIssuer(secret, 3600);
    const token = await issuer.issue({ sub: 'u1', role: 'admin' });
    expect(await issuer.verify(token)).toEqual({ sub: 'u1', role: 'admin' });
  });
  it('rechaza tokens adulterados, de otro secreto o vencidos', async () => {
    const issuer = new JwtTokenIssuer(secret, 3600);
    const token = await issuer.issue({ sub: 'u1', role: 'customer' });
    expect(await issuer.verify(token.slice(0, -2) + 'xx')).toBeNull();
    expect(await new JwtTokenIssuer('y'.repeat(32), 3600).verify(token)).toBeNull();
    const expired = await new JwtTokenIssuer(secret, -10).issue({ sub: 'u1', role: 'customer' });
    expect(await issuer.verify(expired)).toBeNull();
    expect(await issuer.verify('no-es-jwt')).toBeNull();
  });
});

class MemoryStore implements CounterStore {
  data = new Map<string, number>();
  failing = false;
  private g() {
    if (this.failing) throw new Error('redis caído');
  }
  async incr(k: string) {
    this.g();
    const n = (this.data.get(k) ?? 0) + 1;
    this.data.set(k, n);
    return n;
  }
  async expire() {
    this.g();
    return 1;
  }
  async get(k: string) {
    this.g();
    const v = this.data.get(k);
    return v === undefined ? null : String(v);
  }
  async ttl() {
    this.g();
    return 900;
  }
  async del(k: string) {
    this.g();
    this.data.delete(k);
    return 1;
  }
}

describe('LoginRateLimiter', () => {
  it('bloquea tras el máximo de fallos y se reinicia', async () => {
    const limiter = new LoginRateLimiter(new MemoryStore(), { max: 5, windowSeconds: 900 });
    for (let i = 0; i < 5; i += 1) await limiter.recordFailure('k');
    expect(await limiter.check('k')).toEqual({ blocked: true, retryAfterSeconds: 900 });
    await limiter.reset('k');
    expect((await limiter.check('k')).blocked).toBe(false);
  });

  it('si Redis falla usa un contador en memoria (sigue protegiendo)', async () => {
    const store = new MemoryStore();
    store.failing = true;
    let t = 0;
    const limiter = new LoginRateLimiter(store, { max: 2, windowSeconds: 60, now: () => t });
    await limiter.recordFailure('k');
    await limiter.recordFailure('k');
    expect((await limiter.check('k')).blocked).toBe(true);
    t += 61_000;
    expect((await limiter.check('k')).blocked).toBe(false);
  });
});
