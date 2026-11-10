import type { FastifyReply } from 'fastify';

export const SESSION_COOKIE = 'rs_session';

export function setSessionCookie(reply: FastifyReply, token: string, o: { ttlSeconds: number; secure: boolean }) {
  reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: o.secure, path: '/', maxAge: o.ttlSeconds });
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean) {
  reply.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
}
