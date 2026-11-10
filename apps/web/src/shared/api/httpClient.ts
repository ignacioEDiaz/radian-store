import type { ZodType } from 'zod';
import type { Problem } from '@radian/contracts';

/** Error HTTP tipado a partir de problem+json (o de fallas de red/timeout). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly problem?: Problem,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Errores por campo (400) indexados por path. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.problem?.errors ?? []).map((e) => [e.path, e.message]));
  }
}

type QueryValue = string | number | boolean | undefined | null | (string | number)[];

export interface RequestOptions<T> {
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Esquema del contrato para validar la respuesta. */
  schema?: ZodType<T>;
  /** Estados no-2xx cuyo cuerpo es una respuesta válida (p. ej. 503 de /health/ready). */
  acceptStatus?: number[];
}

interface ClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Único punto del frontend que usa `fetch` (Constitución VII).
 * JSON por defecto, cookies incluidas, timeout con AbortController y errores normalizados.
 */
export function createHttpClient({ baseUrl = '', timeoutMs = 10_000 }: ClientOptions = {}) {
  function buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(baseUrl + path, globalThis.location?.origin ?? 'http://localhost');
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      for (const v of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(v));
    }
    return url.toString();
  }

  async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions<T> = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), options.timeoutMs ?? timeoutMs);
    options.signal?.addEventListener('abort', () => controller.abort(options.signal?.reason));

    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
    if (body !== undefined && !isForm) headers['content-type'] = 'application/json';

    let response: Response;
    try {
      response = await fetch(buildUrl(path, options.query), {
        method,
        headers,
        credentials: 'include',
        signal: controller.signal,
        ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {}),
      });
    } catch (err) {
      if (controller.signal.aborted && !options.signal?.aborted) {
        throw new ApiError(0, 'TIMEOUT', 'El servidor tardó demasiado en responder');
      }
      if (options.signal?.aborted) throw err;
      throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor');
    } finally {
      clearTimeout(timer);
    }

    const accepted = response.ok || options.acceptStatus?.includes(response.status);
    if (!accepted) throw await toApiError(response);
    if (response.status === 204) return undefined as T;

    const data: unknown = await response.json();
    if (options.schema) {
      const parsed = options.schema.safeParse(data);
      if (!parsed.success) throw new ApiError(response.status, 'INVALID_RESPONSE', 'Respuesta inesperada del servidor');
      return parsed.data;
    }
    return data as T;
  }

  return {
    request,
    get: <T>(path: string, options?: RequestOptions<T>) => request<T>('GET', path, undefined, options),
    post: <T>(path: string, body?: unknown, options?: RequestOptions<T>) => request<T>('POST', path, body, options),
    put: <T>(path: string, body?: unknown, options?: RequestOptions<T>) => request<T>('PUT', path, body, options),
    patch: <T>(path: string, body?: unknown, options?: RequestOptions<T>) => request<T>('PATCH', path, body, options),
    delete: <T>(path: string, options?: RequestOptions<T>) => request<T>('DELETE', path, undefined, options),
  };
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const problem = (await response.json()) as Problem;
    return new ApiError(response.status, problem.code ?? 'HTTP_ERROR', problem.detail ?? problem.title ?? 'Error', problem);
  } catch {
    return new ApiError(response.status, 'HTTP_ERROR', `Error ${response.status}`);
  }
}

export type HttpClient = ReturnType<typeof createHttpClient>;

export const httpClient = createHttpClient({ baseUrl: import.meta.env.VITE_API_URL ?? '' });
