import type { AdminCollection, AdminProduct, AdminProductRow, Page, ProductStatus } from '@radian/contracts';
import type { CollectionRepository, ProductRepository, SlugAllocator } from '../domain/repositories.js';

/** Stock por variante, provisto por el contexto inventory (puerto, no dominio ajeno). */
export interface InventoryProvisioner {
  provision(input: { variantId: string; productId: string; sku: string; onHand: number }): Promise<void>;
  levels(productId: string): Promise<Map<string, { onHand: number; reserved: number }>>;
}

/** Datos de una imagen subida, provistos por el contexto media. */
export interface MediaLookup {
  find(mediaId: string): Promise<{ id: string; width: number; height: number; widths: number[] } | null>;
}

export interface CatalogRepos {
  products: ProductRepository;
  collections: CollectionRepository;
  slugs: SlugAllocator;
  inventory: InventoryProvisioner;
  media: MediaLookup;
}

/** Consultas de administración sobre el modelo de lectura. */
export interface AdminCatalogReader {
  listProducts(filter: { status?: ProductStatus | undefined; q?: string | undefined; page: number; pageSize: number }): Promise<Page<AdminProductRow>>;
  getProduct(id: string): Promise<AdminProduct | null>;
  listCollections(): Promise<AdminCollection[]>;
}
