import type { Cache, CacheOptions } from '../../application/cache.js';

/** Caché que nunca guarda: útil en tests y como fallback explícito. */
export class NullCache implements Cache {
  async wrap<T>(_name: string, _key: string, _options: CacheOptions, loader: () => Promise<T>): Promise<T> {
    return loader();
  }

  async invalidateTags(_tags: string[]): Promise<void> {}

  async ping(): Promise<void> {}
}
