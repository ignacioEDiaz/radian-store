import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import { DomainError } from '../../../shared/domain/errors.js';

export const STANDARD_WIDTHS = [320, 640, 960, 1280, 1920] as const;

export interface MediaSnapshot {
  id: string;
  sha256: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  widths: number[];
  createdAt: Date;
}

export type MediaEvent = DomainEvent<'media.MediaUploaded', { snapshot: MediaSnapshot }>;

/** Archivo de imagen persistido en el almacenamiento del backend, con sus anchos derivados. */
export class MediaAsset extends AggregateRoot<MediaEvent> {
  readonly aggregateType = 'MediaAsset';

  private constructor(version: number, private readonly s: MediaSnapshot) {
    super(s.id, version);
  }

  static create(input: Omit<MediaSnapshot, 'createdAt'> & { now: Date }): MediaAsset {
    const { now, ...rest } = input;
    if (rest.widths.length === 0) throw new DomainError('INVALID_MEDIA', 'La imagen debe tener al menos un tamaño');
    const asset = new MediaAsset(0, { ...rest, widths: [...rest.widths].sort((a, b) => a - b), createdAt: now });
    asset.record('media.MediaUploaded', { snapshot: asset.toSnapshot() }, now);
    return asset;
  }

  static rehydrate(snapshot: MediaSnapshot): MediaAsset {
    return new MediaAsset(1, snapshot);
  }

  /** Anchos a generar para una imagen de ancho `original` (nunca se agranda). */
  static widthsFor(original: number): number[] {
    const fit = STANDARD_WIDTHS.filter((w) => w <= original);
    return fit.length ? [...fit] : [original];
  }

  url(width: number): string {
    return `/media/${this.s.id}/${width}.webp`;
  }

  defaultUrl(): string {
    return this.url(this.s.widths.includes(960) ? 960 : this.s.widths[this.s.widths.length - 1]!);
  }

  toSnapshot(): MediaSnapshot {
    return { ...this.s, widths: [...this.s.widths] };
  }
}

export interface MediaRepository {
  findById(id: string): Promise<MediaAsset | null>;
  findBySha256(sha256: string): Promise<MediaAsset | null>;
  save(asset: MediaAsset): Promise<void>;
}

/** Almacenamiento binario (disco local del backend; intercambiable por S3/MinIO). */
export interface MediaStorage {
  put(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer | null>;
  removePrefix(prefix: string): Promise<void>;
}

export interface ProcessedImage {
  mimeType: string;
  width: number;
  height: number;
  renditions: { width: number; data: Buffer }[];
}

/** Valida el contenido real, quita metadatos y genera WebP por ancho. */
export interface ImageProcessor {
  process(data: Buffer, widthsFor: (original: number) => number[]): Promise<ProcessedImage>;
}
