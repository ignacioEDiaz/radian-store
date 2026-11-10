import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Hook onSend: agrega ETag (hash del cuerpo) y responde 304 si el cliente ya tiene esa versión.
 * `must-revalidate` evita servir datos viejos del navegador tras un cambio de catálogo.
 */
export async function etagOnSend(req: FastifyRequest, reply: FastifyReply, payload: unknown): Promise<unknown> {
  if (req.method !== 'GET' || reply.statusCode !== 200 || typeof payload !== 'string') return payload;
  const etag = `"${createHash('sha1').update(payload).digest('base64url')}"`;
  reply.header('etag', etag).header('cache-control', 'public, max-age=0, must-revalidate');
  if (req.headers['if-none-match'] === etag) {
    reply.code(304);
    return '';
  }
  return payload;
}
