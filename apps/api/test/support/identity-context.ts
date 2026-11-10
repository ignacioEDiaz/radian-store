import { createIdentityContext } from '../../src/modules/identity/index.js';
import { JwtTokenIssuer } from '../../src/modules/identity/infrastructure/security/jwt-token-issuer.js';
import { NullCache } from '../../src/shared/infrastructure/cache/null-cache.js';
import { Metrics } from '../../src/shared/infrastructure/observability/metrics.js';
import { FakeLimiter, InMemoryCustomerRepository, fakeHasher, fakeUow, fixedClock, inMemoryProfileReader } from './identity-fakes.js';
import { testApp } from './test-app.js';
import type { AppModule } from '../../src/app.js';

export const ORIGIN = 'http://localhost:5173';

/** Contexto identity con adaptadores en memoria para tests de contrato. */
export function identityTestContext() {
  const repo = new InMemoryCustomerRepository();
  const metrics = new Metrics();
  const context = createIdentityContext({
    uow: fakeUow({ customers: repo }),
    reader: inMemoryProfileReader(repo),
    hasher: fakeHasher,
    tokens: new JwtTokenIssuer('t'.repeat(32), 3600),
    limiter: new FakeLimiter(),
    cache: new NullCache(),
    clock: fixedClock,
    ids: { uuid: () => crypto.randomUUID() },
    session: { ttlSeconds: 3600, secureCookie: false },
    admin: { email: 'admin@radian.store', password: 'admin-password-123' },
    metrics,
  });
  return { repo, context, metrics };
}

export async function identityApp(extraModules: (ctx: ReturnType<typeof identityTestContext>) => AppModule[] = () => []) {
  const id = identityTestContext();
  await id.context.onStart?.();
  const { app, logs } = await testApp({ modules: [id.context.appModule, ...extraModules(id)] });
  return { app, logs, ...id };
}

/** Extrae `name=value` de Set-Cookie para reenviarlo. */
export function cookieFrom(res: { headers: Record<string, unknown> }, name: string): string | undefined {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const found = list.find((c: string) => c.startsWith(`${name}=`));
  return found?.split(';')[0];
}
