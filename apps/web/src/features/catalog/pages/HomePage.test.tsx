import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import { renderWithProviders } from '../../../test/render';
import { card, img } from '../test-data';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('muestra hero, colecciones destacadas, novedades y más vendidos con datos reales', async () => {
    server.use(
      http.get('/api/catalog/home', () =>
        HttpResponse.json({
          featuredCollections: [{ id: 'c', slug: 'dresses', title: 'Dresses', description: 'Fluid forms', image: img('x', 'Dresses'), productCount: 7 }],
          newArrivals: [card(1, { title: 'Noir Mini' })],
          bestSellers: [card(2, { title: 'Sharp Leather Boot' })],
        }),
      ),
    );
    renderWithProviders(<HomePage />);
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /dresses/i })).toHaveAttribute('href', '/colecciones/dresses');
    expect(screen.getByRole('region', { name: /novedades/i })).toHaveTextContent('Noir Mini');
    expect(screen.getByRole('region', { name: /más vendidos/i })).toHaveTextContent('Sharp Leather Boot');
  });
});
