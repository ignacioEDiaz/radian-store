import type { FastifyRequest } from 'fastify';
import type { Cache } from '../../../../shared/application/cache.js';
import { ForbiddenError, UnauthorizedError } from '../../../../shared/domain/errors.js';
import type { AuthContext, AuthGuards, Role } from '../../../../shared/infrastructure/http/auth.js';
import type { CustomerProfileReader, TokenIssuer } from '../../application/ports.js';
import { customerTag } from '../../application/queries/get-my-profile.js';
import { SESSION_COOKIE } from './session-cookie.js';

/**
 * Verifica la firma de la sesión y el estado/rol VIGENTE de la cuenta en el modelo de lectura
 * (cacheado), así una desactivación o cambio de rol aplica en la siguiente operación.
 */
export function createAuthGuards(deps: { tokens: TokenIssuer; reader: CustomerProfileReader; cache: Cache }): AuthGuards {
  async function resolve(req: FastifyRequest): Promise<AuthContext | null> {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return null;
    const claims = await deps.tokens.verify(token);
    if (!claims) return null;
    const account = await deps.cache.wrap(
      'identity.auth',
      `identity:auth:${claims.sub}`,
      { tags: [customerTag(claims.sub)], ttlSeconds: 30 },
      () => deps.reader.findAuth(claims.sub),
    );
    if (!account || account.status !== 'active') return null;
    return { customerId: account.id, role: account.role };
  }

  const requireAuth: AuthGuards['requireAuth'] = async (req) => {
    const auth = await resolve(req);
    if (!auth) throw new UnauthorizedError();
    req.auth = auth;
  };

  return {
    requireAuth,
    requireRole: (role: Role) => async (req, reply) => {
      await requireAuth(req, reply);
      if (req.auth?.role !== role) throw new ForbiddenError();
    },
    optionalAuth: async (req) => {
      const auth = await resolve(req).catch(() => null);
      if (auth) req.auth = auth;
    },
  };
}
