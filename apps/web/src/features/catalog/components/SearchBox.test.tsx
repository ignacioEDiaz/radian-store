import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { useLocation } from 'react-router';
import { server } from '../../../test/server';
import { renderWithProviders } from '../../../test/render';
import { card } from '../test-data';
import { SearchBox } from './SearchBox';

function Where() {
  const l = useLocation();
  return <output data-testid="loc">{l.pathname + l.search}</output>;
}

describe('SearchBox', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('pide sugerencias una sola vez tras 200 ms sin escribir (debounce)', async () => {
    const queries: string[] = [];
    server.use(
      http.get('/api/catalog/search/suggestions', ({ request }) => {
        queries.push(new URL(request.url).searchParams.get('q')!);
        return HttpResponse.json({ products: [card(1, { title: 'Sharp Leather Boot', slug: 'sharp-leather-boot' })], collections: [] });
      }),
    );
    renderWithProviders(
      <>
        <SearchBox />
        <Where />
      </>,
    );
    const input = screen.getByRole('combobox', { name: /buscar/i });
    fireEvent.change(input, { target: { value: 'l' } });
    fireEvent.change(input, { target: { value: 'le' } });
    fireEvent.change(input, { target: { value: 'lea' } });
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(await screen.findByRole('option', { name: /sharp leather boot/i })).toBeInTheDocument();
    expect(queries).toEqual(['lea']);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('loc')).toHaveTextContent('/productos/sharp-leather-boot');
  });

  it('Enter sin selección va a la página de resultados', async () => {
    server.use(http.get('/api/catalog/search/suggestions', () => HttpResponse.json({ products: [], collections: [] })));
    renderWithProviders(
      <>
        <SearchBox />
        <Where />
      </>,
    );
    const input = screen.getByRole('combobox', { name: /buscar/i });
    fireEvent.change(input, { target: { value: 'boots' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('loc')).toHaveTextContent('/buscar?q=boots');
  });
});
