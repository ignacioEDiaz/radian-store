import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { DomainError } from '../../../shared/domain/errors.js';
import type { ImageProcessor, ProcessedImage } from '../domain/media-asset.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Procesa con libvips: valida la firma real, corrige orientación, quita metadatos y genera WebP. */
export class SharpImageProcessor implements ImageProcessor {
  constructor(private readonly quality = 82) {}

  async process(data: Buffer, widthsFor: (original: number) => number[]): Promise<ProcessedImage> {
    const type = data.length ? await fileTypeFromBuffer(data) : undefined;
    if (!type || !ALLOWED.has(type.mime)) {
      throw new DomainError('UNSUPPORTED_MEDIA', 'Solo se aceptan imágenes JPEG, PNG o WebP');
    }
    const base = sharp(data, { failOn: 'error' }).rotate(); // aplica la orientación EXIF y la descarta
    const meta = await base.metadata();
    const width = meta.autoOrient?.width ?? meta.width;
    const height = meta.autoOrient?.height ?? meta.height;
    if (!width || !height) throw new DomainError('UNSUPPORTED_MEDIA', 'No se pudieron leer las dimensiones de la imagen');

    const renditions = await Promise.all(
      widthsFor(width).map(async (w) => ({
        width: w,
        // sharp no copia metadatos (EXIF/GPS/ICC) salvo que se pida con withMetadata().
        data: await base.clone().resize({ width: w, withoutEnlargement: true }).webp({ quality: this.quality }).toBuffer(),
      })),
    );
    return { mimeType: type.mime, width, height, renditions };
  }
}
