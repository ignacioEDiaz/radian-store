import type { CollectionView, Home, ProductDetail, ProductList, Suggestions } from '@radian/contracts';
import { httpClient } from '../../../shared/api/httpClient';

export interface ListParams {
  collection?: string | undefined;
  q?: string | undefined;
  color: string[];
  size: string[];
  material: string[];
  type: string[];
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  available?: boolean | undefined;
  sort?: string | undefined;
  page: number;
}

/** Endpoints públicos de la tienda (solo lectura). */
export const catalogService = {
  listProducts: (p: ListParams, signal?: AbortSignal) =>
    httpClient.get<ProductList>('/api/catalog/products', {
      query: { ...p, available: p.available ? 'true' : undefined, page: p.page > 1 ? p.page : undefined },
      ...(signal ? { signal } : {}),
    }),
  getProduct: (slug: string) => httpClient.get<ProductDetail>(`/api/catalog/products/${encodeURIComponent(slug)}`),
  listCollections: () => httpClient.get<CollectionView[]>('/api/catalog/collections'),
  getCollection: (slug: string) => httpClient.get<CollectionView>(`/api/catalog/collections/${encodeURIComponent(slug)}`),
  suggestions: (q: string, signal?: AbortSignal) => httpClient.get<Suggestions>('/api/catalog/search/suggestions', { query: { q }, ...(signal ? { signal } : {}) }),
  home: () => httpClient.get<Home>('/api/catalog/home'),
};
