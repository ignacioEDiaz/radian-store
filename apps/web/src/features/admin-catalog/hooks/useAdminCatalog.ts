import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminProduct, ProductStatus } from '@radian/contracts';
import { queryKeys } from '../../../shared/api/queryKeys';
import { adminCatalogService } from '../services/adminCatalogService';

export function useAdminProducts(filter: { status?: ProductStatus | undefined; q?: string | undefined; page: number }) {
  return useQuery({
    queryKey: queryKeys.admin.products(filter),
    queryFn: () => adminCatalogService.listProducts(filter),
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });
}

export function useAdminProduct(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.product(id ?? ''),
    queryFn: () => adminCatalogService.getProduct(id!),
    enabled: !!id,
    staleTime: 0,
  });
}

/**
 * Mutación sobre un producto: la respuesta del comando ES el estado nuevo (read-your-writes),
 * así que reemplaza la caché sin esperar a que se actualice el modelo de lectura.
 */
export function useProductCommand<I>(productId: string, run: (input: I) => Promise<AdminProduct>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (product) => {
      queryClient.setQueryData(queryKeys.admin.product(productId), product);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminCatalogService.createProduct,
    onSuccess: (product) => {
      queryClient.setQueryData(queryKeys.admin.product(product.id), product);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
  });
}

export function useAdjustStock(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, delta }: { variantId: string; delta: number }) =>
      adminCatalogService.adjustStock(variantId, { delta, reason: delta > 0 ? 'restock' : 'correction' }),
    onSuccess: (level) =>
      queryClient.setQueryData<AdminProduct>(queryKeys.admin.product(productId), (p) =>
        p ? { ...p, variants: p.variants.map((v) => (v.id === level.variantId ? { ...v, ...level } : v)) } : p,
      ),
  });
}

export function useAdminCollections() {
  return useQuery({ queryKey: queryKeys.admin.collections, queryFn: adminCatalogService.listCollections, staleTime: 0 });
}
