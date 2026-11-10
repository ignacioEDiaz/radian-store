import type { Clock, IdGenerator } from '../../shared/application/ports.js';
import { randomIds, systemClock } from '../../shared/application/ports.js';
import type { DbPool } from '../../shared/infrastructure/db/pool.js';
import { createUnitOfWork } from '../../shared/infrastructure/db/unit-of-work.js';
import type { AuthGuards } from '../../shared/infrastructure/http/auth.js';
import type { Metrics } from '../../shared/infrastructure/observability/metrics.js';
import type { BoundedContext } from '../types.js';
import { UploadMedia } from './application/upload-media.js';
import { LocalDiskStorage } from './infrastructure/local-disk-storage.js';
import { registerMediaRoutes } from './infrastructure/media-routes.js';
import { PgMediaRepository } from './infrastructure/pg-media-repository.js';
import { SharpImageProcessor } from './infrastructure/sharp-image-processor.js';

/** Contexto media: subida/procesamiento de imágenes y servido con caché inmutable. */
export function createMediaModule(d: { writeDb: DbPool; guards: AuthGuards; metrics: Metrics; mediaDir: string; clock?: Clock; ids?: IdGenerator }) {
  const storage = new LocalDiskStorage(d.mediaDir);
  const upload = new UploadMedia({
    repo: new PgMediaRepository(d.writeDb),
    storage,
    processor: new SharpImageProcessor(),
    uow: createUnitOfWork(d.writeDb, (tx) => new PgMediaRepository(tx)),
    clock: d.clock ?? systemClock,
    ids: d.ids ?? randomIds,
  });
  const context: BoundedContext = {
    consumers: [],
    appModule: {
      name: 'media',
      register: async (app) => {
        await registerMediaRoutes(app, { upload, storage, guards: d.guards, metrics: d.metrics });
      },
    },
  };
  return { context, upload };
}
