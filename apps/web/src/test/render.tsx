import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

interface Options {
  route?: string;
  /** Patrón de ruta para que funcionen los params (p. ej. `/productos/:slug`). */
  path?: string;
  queryClient?: QueryClient;
  extraRoutes?: { path: string; element: ReactElement }[];
}

export function renderWithProviders(ui: ReactElement, options: Options = {}) {
  const queryClient = options.queryClient ?? createTestQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[options.route ?? '/']}>
        <Routes>
          <Route path={options.path ?? '*'} element={ui} />
          {options.extraRoutes?.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}
