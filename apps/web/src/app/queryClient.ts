import { MutationCache, QueryClient } from '@tanstack/react-query';
import { reportIfReadOnly } from '../shared/api/readOnly';
import { ApiError } from '../shared/api/httpClient';

/** Reintenta solo fallas transitorias (red, timeout, 5xx); nunca errores de negocio 4xx. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError) return error.status === 0 || error.status >= 500;
  return true;
}

export function createQueryClient() {
  return new QueryClient({
    // Toda mutación rechazada por cuenta de solo lectura dispara el diálogo explicativo.
    mutationCache: new MutationCache({ onError: reportIfReadOnly }),
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}
