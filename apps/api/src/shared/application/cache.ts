export interface CacheOptions {
  /** Etiquetas cuya invalidación vuelve obsoleta la entrada. */
  tags: string[];
  ttlSeconds?: number;
}

/**
 * Puerto de caché (cache-aside). Las implementaciones DEBEN degradar al loader
 * si el almacenamiento falla: la caché nunca es requisito para responder.
 */
export interface Cache {
  wrap<T>(name: string, key: string, options: CacheOptions, loader: () => Promise<T>): Promise<T>;
  invalidateTags(tags: string[]): Promise<void>;
  ping(): Promise<void>;
}
