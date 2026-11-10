import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { PAGE_SIZE } from '@radian/contracts';
import { queryKeys } from '../../../shared/api/queryKeys';
import { catalogService, type ListParams } from '../services/catalogService';

/** Listado con la página anterior visible mientras carga la nueva y prefetch de la siguiente. */
export function useProducts(params: ListParams) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.catalog.list(params),
    queryFn: ({ signal }) => catalogService.listProducts(params, signal),
    placeholderData: keepPreviousData,
  });
  const hasNext = !!query.data && query.data.total > params.page * PAGE_SIZE;
  useEffect(() => {
    if (!hasNext) return;
    const next = { ...params, page: params.page + 1 };
    void queryClient.prefetchQuery({ queryKey: queryKeys.catalog.list(next), queryFn: () => catalogService.listProducts(next) });
  }, [hasNext, params, queryClient]);
  return query;
}

export function useProduct(slug: string) {
  return useQuery({ queryKey: queryKeys.catalog.product(slug), queryFn: () => catalogService.getProduct(slug) });
}

export function useCollection(slug: string | undefined) {
  return useQuery({ queryKey: queryKeys.catalog.collection(slug ?? ''), queryFn: () => catalogService.getCollection(slug!), enabled: !!slug });
}

export function useCollections() {
  return useQuery({ queryKey: queryKeys.catalog.collections, queryFn: catalogService.listCollections, staleTime: 5 * 60_000 });
}

export function useHome() {
  return useQuery({ queryKey: queryKeys.catalog.home, queryFn: catalogService.home });
}

export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function useSuggestions(q: string) {
  const term = useDebouncedValue(q.trim(), 200);
  return useQuery({
    queryKey: queryKeys.catalog.suggestions(term.toLowerCase()),
    queryFn: ({ signal }) => catalogService.suggestions(term, signal),
    enabled: term.length >= 2,
    staleTime: 60_000,
  });
}
