import type { Cache } from '../../shared/application/cache.js';
import type { Clock, IdGenerator } from '../../shared/application/ports.js';
import { randomIds, systemClock } from '../../shared/application/ports.js';
import type { UnitOfWork } from '../../shared/application/unit-of-work.js';
import { createUnitOfWork } from '../../shared/infrastructure/db/unit-of-work.js';
import type { AfterLoginHook, AuthGuards } from '../../shared/infrastructure/http/auth.js';
import type { Metrics } from '../../shared/infrastructure/observability/metrics.js';
import type { BoundedContext, ModuleContext } from '../types.js';
import { Authenticate } from './application/commands/authenticate.js';
import { EnsureStaffAccount } from './application/commands/ensure-staff-account.js';
import { RegisterCustomer } from './application/commands/register-customer.js';
import { UpdateProfile } from './application/commands/update-profile.js';
import type { CustomerProfileReader, IdentityRepos, LoginAttemptLimiter, TokenIssuer } from './application/ports.js';
import { GetMyProfile } from './application/queries/get-my-profile.js';
import type { PasswordHasher } from './domain/password-hasher.js';
import { createAuthGuards } from './infrastructure/http/auth-guard.js';
import { registerIdentityRoutes } from './infrastructure/http/identity-routes.js';
import { PgCustomerProfileReader } from './infrastructure/persistence/pg-customer-profile-reader.js';
import { PgCustomerRepository } from './infrastructure/persistence/pg-customer-repository.js';
import { customerProfileProjection } from './infrastructure/projections/customer-profile-projection.js';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher.js';
import { JwtTokenIssuer } from './infrastructure/security/jwt-token-issuer.js';
import { LoginRateLimiter, type CounterStore } from './infrastructure/security/login-rate-limiter.js';

export interface IdentityDeps {
  uow: UnitOfWork<IdentityRepos>;
  reader: CustomerProfileReader;
  hasher: PasswordHasher;
  tokens: TokenIssuer;
  limiter: LoginAttemptLimiter;
  cache: Cache;
  clock: Clock;
  ids: IdGenerator;
  session: { ttlSeconds: number; secureCookie: boolean };
  /** Cuentas de staff a garantizar al arrancar (admin, viewer). */
  staff: { email: string; password: string; role: 'admin' | 'viewer'; name?: string }[];
  metrics: Metrics;
}

export interface IdentityContext extends BoundedContext {
  guards: AuthGuards;
  /** Otros contextos agregan acá lo que deba ocurrir tras iniciar sesión (p. ej. merge de carrito). */
  afterLogin: AfterLoginHook[];
}

/** Arma el contexto con los adaptadores recibidos (reales o en memoria para tests). */
export function createIdentityContext(d: IdentityDeps): IdentityContext {
  const guards = createAuthGuards({ tokens: d.tokens, reader: d.reader, cache: d.cache });
  const afterLogin: AfterLoginHook[] = [];
  const ensureStaff = new EnsureStaffAccount(d);
  return {
    guards,
    afterLogin,
    consumers: [customerProfileProjection],
    appModule: {
      name: 'identity',
      register: (app) =>
        registerIdentityRoutes(app, {
          register: new RegisterCustomer(d),
          authenticate: new Authenticate(d),
          updateProfile: new UpdateProfile(d),
          getMyProfile: new GetMyProfile(d),
          tokens: d.tokens,
          guards,
          session: d.session,
          afterLogin,
          metrics: d.metrics,
        }),
    },
    onStart: async () => {
      for (const account of d.staff) await ensureStaff.execute(account);
    },
  };
}

/** Composition root con adaptadores de producción. */
export function createIdentityModule(ctx: ModuleContext, redis: CounterStore): IdentityContext {
  return createIdentityContext({
    uow: createUnitOfWork(ctx.infra.writeDb, (tx) => ({ customers: new PgCustomerRepository(tx) })),
    reader: new PgCustomerProfileReader(ctx.infra.readDb),
    hasher: new Argon2PasswordHasher(),
    tokens: new JwtTokenIssuer(ctx.config.session.secret, ctx.config.session.ttlSeconds),
    limiter: new LoginRateLimiter(redis, { max: 5, windowSeconds: 15 * 60 }),
    cache: ctx.infra.cache,
    clock: systemClock,
    ids: randomIds,
    session: ctx.config.session,
    staff: ctx.config.staff,
    metrics: ctx.metrics,
  });
}
