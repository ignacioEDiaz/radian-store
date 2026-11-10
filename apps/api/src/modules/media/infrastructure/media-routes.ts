import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { DomainError, NotFoundError } from '../../../shared/domain/errors.js';
import type { AuthGuards } from '../../../shared/infrastructure/http/auth.js';
import { parseParams } from '../../../shared/infrastructure/http/validation.js';
import type { Metrics } from '../../../shared/infrastructure/observability/metrics.js';
import type { UploadMedia } from '../application/upload-media.js';
import type { MediaStorage } from '../domain/media-asset.js';

const MAX_BYTES = 10 * 1024 * 1024;
const fileParams = z.object({ mediaId: z.uuid(), file: z.string().regex(/^\d{2,4}\.webp$/) });

export function registerMediaRoutes(app: FastifyInstance, d: { upload: UploadMedia; storage: MediaStorage; guards: AuthGuards; metrics: Metrics }) {
  return app.register(async (scope) => {
    await scope.register(multipart, { limits: { fileSize: MAX_BYTES, files: 1, fields: 5 } });

    scope.post('/api/admin/media', { preHandler: d.guards.requireRole('admin') }, async (req, reply) => {
      const file = await req.file();
      if (!file) throw new DomainError('FILE_REQUIRED', 'Falta el archivo (campo "file")');
      let buffer: Buffer;
      try {
        buffer = await file.toBuffer();
      } catch (err) {
        d.metrics.mediaUploads.inc({ result: 'too_large' });
        throw err; // @fastify/multipart responde 413
      }
      const end = d.metrics.mediaProcessing.startTimer();
      try {
        const { asset, created } = await d.upload.execute(buffer);
        d.metrics.mediaUploads.inc({ result: created ? 'created' : 'deduplicated' });
        return reply.status(created ? 201 : 200).send(asset);
      } catch (err) {
        d.metrics.mediaUploads.inc({ result: 'rejected' });
        if (err instanceof DomainError && err.code === 'UNSUPPORTED_MEDIA') {
          return reply.status(415).type('application/problem+json').send({
            type: 'https://radian.store/problems/unsupported-media',
            title: 'Tipo de contenido no soportado',
            status: 415,
            code: 'UNSUPPORTED_MEDIA',
            detail: err.message,
            requestId: String(req.id),
          });
        }
        throw err;
      } finally {
        end();
      }
    });

    // Público: URLs versionadas por id → caché inmutable.
    scope.get('/media/:mediaId/:file', async (req, reply) => {
      const { mediaId, file } = parseParams(fileParams, req.params);
      const etag = `"${mediaId}-${file}"`;
      if (req.headers['if-none-match'] === etag) return reply.status(304).send();
      const data = await d.storage.read(`${mediaId}/${file}`);
      if (!data) throw new NotFoundError('MEDIA_NOT_FOUND', 'Imagen inexistente');
      return reply
        .header('content-type', 'image/webp')
        .header('cache-control', 'public, max-age=31536000, immutable')
        .header('etag', etag)
        .send(data);
    });
  });
}
