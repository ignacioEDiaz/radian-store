import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Problem } from '@radian/contracts';
import { AppError, ValidationError } from '../../domain/errors.js';

const STATUS: Record<AppError['kind'], number> = {
  validation: 400,
  unauthorized: 401,
  payment: 402,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  domain: 422,
  rate_limited: 429,
  unavailable: 503,
};

const TITLES: Record<number, string> = {
  400: 'Datos inválidos',
  401: 'No autenticado',
  402: 'Pago rechazado',
  403: 'Prohibido',
  404: 'No encontrado',
  409: 'Conflicto',
  413: 'Archivo demasiado grande',
  415: 'Tipo de contenido no soportado',
  422: 'Operación no permitida',
  429: 'Demasiados intentos',
  500: 'Error interno',
  503: 'Servicio no disponible',
};

function send(reply: FastifyReply, req: FastifyRequest, status: number, body: Omit<Problem, 'status' | 'title' | 'type' | 'instance' | 'requestId'> & { title?: string }) {
  const problem: Problem = {
    type: `https://radian.store/problems/${body.code.toLowerCase().replaceAll('_', '-')}`,
    title: body.title ?? TITLES[status] ?? 'Error',
    status,
    instance: req.url.split('?')[0] ?? req.url,
    requestId: String(req.id),
    ...body,
  };
  return reply.status(status).type('application/problem+json').send(problem);
}

/** Traduce cualquier error a RFC 9457 (problem+json) sin filtrar detalles internos. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof ValidationError) {
      return send(reply, req, 400, { code: err.code, detail: err.message, errors: err.issues });
    }
    if (err instanceof AppError) {
      const status = STATUS[err.kind];
      if (status === 429 && typeof err.meta?.['retryAfterSeconds'] === 'number') {
        reply.header('retry-after', String(err.meta['retryAfterSeconds']));
      }
      if (status >= 500) req.log.warn({ err }, err.message);
      return send(reply, req, status, { code: err.code, detail: err.message, ...(err.meta ? { meta: err.meta } : {}) });
    }
    const statusCode = (err as FastifyError).statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      const code = (err as FastifyError).code ?? 'BAD_REQUEST';
      return send(reply, req, statusCode, { code, detail: err.message });
    }
    req.log.error({ err }, 'Error no controlado');
    return send(reply, req, 500, { code: 'INTERNAL_ERROR', detail: 'Ocurrió un error inesperado' });
  });

  app.setNotFoundHandler((req, reply) =>
    send(reply, req, 404, { code: 'ROUTE_NOT_FOUND', detail: `No existe ${req.method} ${req.url.split('?')[0]}` }),
  );
}
