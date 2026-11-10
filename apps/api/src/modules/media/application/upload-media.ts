import { createHash } from 'node:crypto';
import type { Clock, IdGenerator } from '../../../shared/application/ports.js';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.js';
import { ConflictError } from '../../../shared/domain/errors.js';
import { MediaAsset, type ImageProcessor, type MediaRepository, type MediaStorage } from '../domain/media-asset.js';

export interface MediaAssetView {
  id: string;
  url: string;
  width: number;
  height: number;
  widths: number[];
  mimeType: string;
  bytes: number;
}

export function toMediaView(asset: MediaAsset): MediaAssetView {
  const s = asset.toSnapshot();
  return { id: s.id, url: asset.defaultUrl(), width: s.width, height: s.height, widths: s.widths, mimeType: s.mimeType, bytes: s.bytes };
}

interface Deps {
  repo: MediaRepository;
  storage: MediaStorage;
  processor: ImageProcessor;
  uow: UnitOfWork<MediaRepository>;
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Sube una imagen: valida y procesa, persiste los anchos en el almacenamiento del backend
 * y registra el asset. Idempotente por contenido (sha256). Si falla la base, limpia los archivos.
 */
export class UploadMedia {
  constructor(private readonly d: Deps) {}

  async execute(data: Buffer): Promise<{ asset: MediaAssetView; created: boolean }> {
    const sha256 = createHash('sha256').update(data).digest('hex');
    const existing = await this.d.uow.run((repo) => repo.findBySha256(sha256));
    if (existing) return { asset: toMediaView(existing), created: false };

    const processed = await this.d.processor.process(data, MediaAsset.widthsFor);
    const id = this.d.ids.uuid();
    const asset = MediaAsset.create({
      id,
      sha256,
      mimeType: processed.mimeType,
      width: processed.width,
      height: processed.height,
      bytes: data.length,
      widths: processed.renditions.map((r) => r.width),
      now: this.d.clock.now(),
    });

    try {
      for (const r of processed.renditions) await this.d.storage.put(`${id}/${r.width}.webp`, r.data);
      await this.d.uow.run((repo) => repo.save(asset));
      return { asset: toMediaView(asset), created: true };
    } catch (err) {
      await this.d.storage.removePrefix(id);
      if (err instanceof ConflictError) {
        // Otra subida concurrente del mismo archivo ganó: devolvemos esa.
        const winner = await this.d.uow.run((repo) => repo.findBySha256(sha256));
        if (winner) return { asset: toMediaView(winner), created: false };
      }
      throw err;
    }
  }
}
