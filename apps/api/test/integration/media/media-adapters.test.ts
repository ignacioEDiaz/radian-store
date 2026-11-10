import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { SharpImageProcessor } from '../../../src/modules/media/infrastructure/sharp-image-processor.js';
import { LocalDiskStorage } from '../../../src/modules/media/infrastructure/local-disk-storage.js';
import { MediaAsset } from '../../../src/modules/media/domain/media-asset.js';
import { fakePngThatIsPdf, jpegWithExif, png } from '../../support/images.js';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'radian-media-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('SharpImageProcessor', () => {
  const processor = new SharpImageProcessor();

  it('genera WebP en los anchos estándar que no superan el original y sin metadatos', async () => {
    const result = await processor.process(await jpegWithExif(1000, 1300), MediaAsset.widthsFor);
    expect(result).toMatchObject({ mimeType: 'image/jpeg', width: 1000, height: 1300 });
    expect(result.renditions.map((r) => r.width)).toEqual([320, 640, 960]);
    const meta = await sharp(result.renditions[2]!.data).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(960);
    expect(meta.exif).toBeUndefined();
    expect(result.renditions[2]!.data.toString('latin1')).not.toContain('GPS-LEAK');
  });

  it('una imagen chica conserva su ancho original (no se agranda)', async () => {
    const result = await processor.process(await png(200, 200), MediaAsset.widthsFor);
    expect(result.renditions.map((r) => r.width)).toEqual([200]);
  });

  it('rechaza archivos que no son imágenes aunque tengan extensión de imagen', async () => {
    await expect(processor.process(fakePngThatIsPdf, MediaAsset.widthsFor)).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
    await expect(processor.process(Buffer.alloc(0), MediaAsset.widthsFor)).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
  });
});

describe('LocalDiskStorage', () => {
  it('guarda, lee y borra por prefijo sin permitir escapar del directorio', async () => {
    const storage = new LocalDiskStorage(dir);
    await storage.put('abc/320.webp', Buffer.from('x'));
    await storage.put('abc/640.webp', Buffer.from('y'));
    expect((await storage.read('abc/320.webp'))?.toString()).toBe('x');
    expect(await storage.read('nope/1.webp')).toBeNull();
    await storage.removePrefix('abc');
    expect(await storage.read('abc/640.webp')).toBeNull();
    await expect(storage.put('../evil.webp', Buffer.from('z'))).rejects.toThrow(/inválida/);
  });
});
