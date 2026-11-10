import type { Collection } from './collection.js';
import type { Product } from './product.js';
import type { Slug } from './slug.js';

export interface ProductRepository {
  findById(id: string): Promise<Product | null>;
  findBySlug(slug: string): Promise<Product | null>;
  /** Concurrencia optimista + eventos al outbox en la misma transacción. */
  save(product: Product): Promise<void>;
}

export interface CollectionRepository {
  findById(id: string): Promise<Collection | null>;
  findBySlug(slug: string): Promise<Collection | null>;
  findContaining(productId: string): Promise<Collection[]>;
  save(collection: Collection): Promise<void>;
}

/** Resuelve un slug libre (`base`, `base-2`, `base-3`…). */
export interface SlugAllocator {
  allocate(kind: 'product' | 'collection', base: Slug): Promise<Slug>;
}
