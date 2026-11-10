import type { FastifyReply, FastifyRequest } from 'fastify';

export type Role = 'customer' | 'admin';

export interface AuthContext {
  customerId: string;
  role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

type PreHandler = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

/**
 * Guards de autenticación que provee el contexto identity y consumen los demás contextos
 * (se inyectan desde el composition root, sin acoplar módulos entre sí).
 */
export interface AuthGuards {
  /** 401 si no hay sesión válida y activa. */
  requireAuth: PreHandler;
  /** 401/403 según sesión y rol. */
  requireRole(role: Role): PreHandler;
  /** Completa `req.auth` si hay sesión válida; nunca falla. */
  optionalAuth: PreHandler;
}

/** Ganchos que se ejecutan tras iniciar sesión o registrarse (p. ej. combinar el carrito). */
export type AfterLoginHook = (req: FastifyRequest, reply: FastifyReply, customerId: string) => Promise<void>;
