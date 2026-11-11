import type { ThemeBackend, ThemeRequest } from './themeBackend';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body === 'string') {
    try {
      const parsed: unknown = JSON.parse(body);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return Object.fromEntries(new URLSearchParams(body));
    }
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return Object.fromEntries([...body.entries()].filter(([, v]) => typeof v === 'string'));
  }
  if (body instanceof URLSearchParams) return Object.fromEntries(body);
  return {};
}

export function toThemeRequest(input: FetchInput, init: FetchInit, origin: string): ThemeRequest | null {
  // El tema siempre llama con una URL (string); un Request ya construido no es suyo.
  if (typeof input !== 'string' && !(input instanceof URL)) return null;
  let url: URL;
  try {
    url = new URL(String(input), origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  return { method: (init?.method ?? 'GET').toUpperCase(), url, body: parseBody(init?.body) };
}

/**
 * Intercepta los `fetch` que el tema dirige a endpoints de Shopify y los responde con el
 * backend propio. Cualquier otro pedido (nuestra API, archivos) pasa sin tocar.
 */
export function installFetchBridge(backend: Pick<ThemeBackend, 'handle'>, target: { fetch: typeof fetch; location: { origin: string } } = window) {
  const native = target.fetch.bind(target);
  target.fetch = ((input: FetchInput, init?: FetchInit) => {
    const request = toThemeRequest(input, init, target.location.origin);
    const handled = request ? backend.handle(request) : null;
    return handled ?? native(input, init);
  }) as typeof fetch;
  return () => {
    target.fetch = native;
  };
}
