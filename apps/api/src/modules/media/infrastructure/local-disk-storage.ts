import { mkdir, readFile, rm, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { MediaStorage } from '../domain/media-asset.js';

const KEY = /^[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9.-]+)*$/;

/** Almacenamiento en el disco del backend (volumen persistente en Docker). */
export class LocalDiskStorage implements MediaStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    // Escritura atómica: nunca se sirve un archivo a medio escribir.
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, file);
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async removePrefix(prefix: string): Promise<void> {
    await rm(this.resolve(prefix), { recursive: true, force: true });
  }

  private resolve(key: string): string {
    if (!KEY.test(key) || key.includes('..')) throw new Error(`Clave de almacenamiento inválida: ${key}`);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Clave de almacenamiento inválida: ${key}`);
    return full;
  }
}
