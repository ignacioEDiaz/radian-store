import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/api/queryKeys';
import { catalogService, type ListParams } from '../services/catalogService';

/**
 * Listado "cargar más" (como la grilla del tema): cada página se suma a las anteriores.
 * Los filtros forman parte de la clave, así que cambiar uno reinicia desde la página 1 mientras
 * se sigue mostrando el resultado anterior hasta que llega el nuevo.
 */
export function useInfiniteProducts(params: Omit<ListParams, 'page'>) {
  return useInfiniteQuery({
    queryKey: queryKeys.catalog.list({ ...params, infinite: true }),
    queryFn: ({ pageParam, signal }) => catalogService.listProducts({ ...params, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(slug: string) {
  return useQuery({ queryKey: queryKeys.catalog.product(slug), queryFn: () => catalogService.getProduct(slug) });
}

export function useCollection(slug: string | undefined) {
  return useQuery({ queryKey: queryKeys.catalog.collection(slug ?? ''), queryFn: () => catalogService.getCollection(slug!), enabled: !!slug, retry: false });
}
