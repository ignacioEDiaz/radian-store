import { describe, expect, it } from 'vitest';
import { UploadMedia } from '../../../src/modules/media/application/upload-media.js';
import type { MediaAsset, ImageProcessor, MediaRepository, MediaStorage } from '../../../src/modules/media/domain/media-asset.js';
import { DomainError } from '../../../src/shared/domain/errors.js';
import { fixedClock, sequentialIds } from '../../support/identity-fakes.js';

class MemoryRepo implements MediaRepository {
  items = new Map<string, MediaAsset>();
  failSave = false;
  async findById(id: string) {
    return this.items.get(id) ?? null;
  }
  async findBySha256(sha: string) {
    return [...this.items.values()].find((m) => m.toSnapshot().sha256 === sha) ?? null;
  }
  async save(asset: MediaAsset) {
    if (this.failSave) throw new Error('db caída');
    asset.pullEvents();
    this.items.set(asset.id, asset);
  }
}

class MemoryStorage implements MediaStorage {
  files = new Map<string, Buffer>();
  async put(k: string, d: Buffer) {
    this.files.set(k, d);
  }
  async read(k: string) {
    return this.files.get(k) ?? null;
  }
  async removePrefix(p: string) {
    for (const k of [...this.files.keys()]) if (k.startsWith(`${p}/`)) this.files.delete(k);
  }
}

const processor: ImageProcessor = {
  async process(data, widthsFor) {
    if (data.toString() === 'no-imagen') throw new DomainError('UNSUPPORTED_MEDIA', 'no');
    return { mimeType: 'image/png', width: 700, height: 900, renditions: widthsFor(700).map((width) => ({ width, data: Buffer.from(`w${width}`) })) };
  },
};

function setup() {
  const repo = new MemoryRepo();
  const storage = new MemoryStorage();
  const upload = new UploadMedia({ repo, storage, processor, uow: { run: (w) => w(repo) }, clock: fixedClock, ids: sequentialIds() });
  return { repo, storage, upload };
}

describe('UploadMedia', () => {
  it('procesa, guarda cada ancho en el almacenamiento y registra el asset', async () => {
    const { upload, storage } = setup();
    const { asset, created } = await upload.execute(Buffer.from('imagen-1'));
    expect(created).toBe(true);
    expect(asset).toMatchObject({ width: 700, widths: [320, 640], url: `/media/${asset.id}/640.webp` });
    expect([...storage.files.keys()].sort()).toEqual([`${asset.id}/320.webp`, `${asset.id}/640.webp`]);
  });

  it('es idempotente por contenido (sha256): la misma imagen devuelve el asset existente', async () => {
    const { upload, storage } = setup();
    const first = await upload.execute(Buffer.from('igual'));
    const second = await upload.execute(Buffer.from('igual'));
    expect(second).toEqual({ asset: first.asset, created: false });
    expect(storage.files.size).toBe(2);
  });

  it('si el asset existe pero sus archivos se perdieron del almacenamiento, los regenera con el mismo id', async () => {
    const { upload, storage } = setup();
    const first = await upload.execute(Buffer.from('perdida'));
    storage.files.clear(); // p. ej. volumen recreado o backup de base sin archivos
    const again = await upload.execute(Buffer.from('perdida'));
    expect(again).toEqual({ asset: first.asset, created: false });
    expect([...storage.files.keys()].sort()).toEqual([`${first.asset.id}/320.webp`, `${first.asset.id}/640.webp`]);
  });

  it('no deja archivos huérfanos si falla el guardado en base', async () => {
    const { upload, storage, repo } = setup();
    repo.failSave = true;
    await expect(upload.execute(Buffer.from('x'))).rejects.toThrow('db caída');
    expect(storage.files.size).toBe(0);
  });

  it('propaga el rechazo del procesador', async () => {
    const { upload } = setup();
    await expect(upload.execute(Buffer.from('no-imagen'))).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
  });
});
