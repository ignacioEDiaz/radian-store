import type { FastifyInstance } from 'fastify';
import { loginRequestSchema, registerRequestSchema, updateProfileRequestSchema } from '@radian/contracts';
import { parseBody } from '../../../../shared/infrastructure/http/validation.js';
import type { AfterLoginHook, AuthGuards } from '../../../../shared/infrastructure/http/auth.js';
import type { Metrics } from '../../../../shared/infrastructure/observability/metrics.js';
import type { RegisterCustomer } from '../../application/commands/register-customer.js';
import type { Authenticate } from '../../application/commands/authenticate.js';
import type { UpdateProfile } from '../../application/commands/update-profile.js';
import type { GetMyProfile } from '../../application/queries/get-my-profile.js';
import type { TokenIssuer } from '../../application/ports.js';
import { clearSessionCookie, setSessionCookie } from './session-cookie.js';

export interface IdentityRouteDeps {
  register: RegisterCustomer;
  authenticate: Authenticate;
  updateProfile: UpdateProfile;
  getMyProfile: GetMyProfile;
  tokens: TokenIssuer;
  guards: AuthGuards;
  session: { ttlSeconds: number; secureCookie: boolean };
  afterLogin: AfterLoginHook[];
  metrics: Metrics;
}

export function registerIdentityRoutes(app: FastifyInstance, d: IdentityRouteDeps): void {
  const cookieOpts = { ttlSeconds: d.session.ttlSeconds, secure: d.session.secureCookie };

  app.post('/api/auth/register', async (req, reply) => {
    const input = parseBody(registerRequestSchema, req.body);
    const profile = await d.register.execute(input);
    setSessionCookie(reply, await d.tokens.issue({ sub: profile.id, role: profile.role }), cookieOpts);
    for (const hook of d.afterLogin) await hook(req, reply, profile.id);
    return reply.status(201).send(profile);
  });

  app.post('/api/auth/login', async (req, reply) => {
    const input = parseBody(loginRequestSchema, req.body);
    try {
      const profile = await d.authenticate.execute({ ...input, ip: req.ip });
      d.metrics.authLogins.inc({ result: 'success' });
      setSessionCookie(reply, await d.tokens.issue({ sub: profile.id, role: profile.role }), cookieOpts);
      for (const hook of d.afterLogin) await hook(req, reply, profile.id);
      return profile;
    } catch (err) {
      d.metrics.authLogins.inc({ result: (err as { code?: string }).code === 'TOO_MANY_ATTEMPTS' ? 'blocked' : 'failure' });
      throw err;
    }
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    clearSessionCookie(reply, d.session.secureCookie);
    return reply.status(204).send();
  });

  app.get('/api/me', { preHandler: d.guards.requireAuth }, async (req) => d.getMyProfile.execute({ customerId: req.auth!.customerId }));

  app.patch('/api/me', { preHandler: d.guards.requireAuth }, async (req) => {
    const input = parseBody(updateProfileRequestSchema, req.body);
    return d.updateProfile.execute({ customerId: req.auth!.customerId, ...input });
  });
}
