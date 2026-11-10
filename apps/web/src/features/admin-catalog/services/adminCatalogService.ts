import type {
  AddVariantRequest,
  AdminCollection,
  AdminProduct,
  AdminProductRow,
  CreateCollectionRequest,
  CreateProductRequest,
  InventoryLevel,
  MediaAssetDto,
  Page,
  ProductStatus,
  StockAdjustmentRequest,
  UpdateProductRequest,
} from '@radian/contracts';
import { httpClient } from '../../../shared/api/httpClient';

const base = '/api/admin';
const product = (id: string) => `${base}/products/${id}`;

/** Endpoints del panel de administración del catálogo. */
export const adminCatalogService = {
  listProducts: (filter: { status?: ProductStatus | undefined; q?: string | undefined; page?: number }) =>
    httpClient.get<Page<AdminProductRow>>(`${base}/products`, { query: filter }),
  getProduct: (id: string) => httpClient.get<AdminProduct>(product(id)),
  createProduct: (input: CreateProductRequest) => httpClient.post<AdminProduct>(`${base}/products`, input),
  updateProduct: (id: string, input: UpdateProductRequest) => httpClient.patch<AdminProduct>(product(id), input),
  addVariant: (id: string, input: AddVariantRequest) => httpClient.post<AdminProduct>(`${product(id)}/variants`, input),
  removeVariant: (id: string, variantId: string, expectedVersion: number) =>
    httpClient.delete<AdminProduct>(`${product(id)}/variants/${variantId}`, { query: { expectedVersion } }),
  attachImage: (id: string, input: { expectedVersion: number; mediaId: string; alt: string; color: string | null }) =>
    httpClient.post<AdminProduct>(`${product(id)}/images`, input),
  updateImage: (id: string, imageId: string, input: { expectedVersion: number; alt?: string; color?: string | null }) =>
    httpClient.patch<AdminProduct>(`${product(id)}/images/${imageId}`, input),
  reorderImages: (id: string, input: { expectedVersion: number; imageIds: string[] }) => httpClient.put<AdminProduct>(`${product(id)}/images/order`, input),
  removeImage: (id: string, imageId: string, expectedVersion: number) =>
    httpClient.delete<AdminProduct>(`${product(id)}/images/${imageId}`, { query: { expectedVersion } }),
  changeStatus: (id: string, action: 'publish' | 'unpublish' | 'archive', expectedVersion: number) =>
    httpClient.post<AdminProduct>(`${product(id)}/${action}`, { expectedVersion }),
  adjustStock: (variantId: string, input: StockAdjustmentRequest) => httpClient.post<InventoryLevel>(`${base}/inventory/${variantId}/adjustments`, input),
  uploadMedia: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return httpClient.post<MediaAssetDto>(`${base}/media`, form, { timeoutMs: 60_000 });
  },
  listCollections: () => httpClient.get<AdminCollection[]>(`${base}/collections`),
  createCollection: (input: CreateCollectionRequest) => httpClient.post<AdminCollection>(`${base}/collections`, input),
  setCollectionProducts: (id: string, input: { expectedVersion: number; productIds: string[] }) =>
    httpClient.put<AdminCollection>(`${base}/collections/${id}/products`, input),
};
