import type { CollectionView, Home, ProductDetail, ProductList, ProductListQuery, Suggestions } from '@radian/contracts';
import type { Cache } from '../../../../shared/application/cache.js';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import { cacheKeyFor, normalizeFilters, type NormalizedFilters } from './product-filters.js';

/** Puerto del modelo de lectura de la tienda (implementado con SQL sobre read-db). */
export interface CatalogReadModel {
  listProducts(filters: NormalizedFilters): Promise<ProductList>;
  getProduct(slug: string): Promise<ProductDetail | null>;
  listCollections(): Promise<CollectionView[]>;
  getCollection(slug: string): Promise<CollectionView | null>;
  suggestions(q: string): Promise<Suggestions>;
  home(): Promise<Home>;
}

/** Tags invalidados por las proyecciones del catálogo (ver catalog-projection). */
const TAGS = { list: 'catalog:list', home: 'catalog:home', collections: 'catalog:collections' };

/**
 * Consultas de la tienda: solo modelo de lectura + caché cache-aside (Constitución III y IV).
 * Cualquier cambio de producto o stock invalida `catalog:list`, que cubre listados, detalle
 * (incluye relacionados) y búsqueda.
 */
export class StorefrontQueries {
  constructor(private readonly d: { readModel: CatalogReadModel; cache: Cache }) {}

  listProducts(query: ProductListQuery): Promise<ProductList> {
    const filters = normalizeFilters(query);
    return this.d.cache.wrap('catalog.list', cacheKeyFor('list', filters), { tags: [TAGS.list, TAGS.collections] }, () => this.d.readModel.listProducts(filters));
  }

  async getProduct(slug: string): Promise<ProductDetail> {
    const product = await this.d.cache.wrap('catalog.detail', cacheKeyFor('detail', slug), { tags: [TAGS.list] }, () => this.d.readModel.getProduct(slug));
    if (!product) throw new NotFoundError('PRODUCT_NOT_FOUND', 'El producto no existe o no está disponible');
    return product;
  }

  listCollections(): Promise<CollectionView[]> {
    return this.d.cache.wrap('catalog.collections', 'catalog:collections:all', { tags: [TAGS.collections, TAGS.list] }, () => this.d.readModel.listCollections());
  }

  async getCollection(slug: string): Promise<CollectionView> {
    const c = await this.d.cache.wrap('catalog.collection', cacheKeyFor('collection', slug), { tags: [TAGS.collections, TAGS.list] }, () => this.d.readModel.getCollection(slug));
    if (!c) throw new NotFoundError('COLLECTION_NOT_FOUND', 'La colección no existe');
    return c;
  }

  suggestions(q: string): Promise<Suggestions> {
    const key = q.trim().toLowerCase();
    return this.d.cache.wrap('catalog.suggestions', cacheKeyFor('suggest', key), { tags: [TAGS.list, TAGS.collections], ttlSeconds: 120 }, () =>
      this.d.readModel.suggestions(key),
    );
  }

  home(): Promise<Home> {
    return this.d.cache.wrap('catalog.home', 'catalog:home', { tags: [TAGS.home, TAGS.list, TAGS.collections] }, () => this.d.readModel.home());
  }
}
