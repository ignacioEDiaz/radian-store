import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import { renderWithProviders } from '../../../test/render';
import { problem } from '../../../test/fixtures';
import { detail } from '../test-data';
import { ProductPage } from './ProductPage';

const open = (slug = 'sharp-leather-boot') => renderWithProviders(<ProductPage />, { route: `/productos/${slug}`, path: '/productos/:slug' });

describe('ProductPage', () => {
  it('muestra datos, precios y relacionados', async () => {
    server.use(http.get('/api/catalog/products/sharp-leather-boot', () => HttpResponse.json(detail())));
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Sharp Leather Boot' })).toBeInTheDocument();
    expect(screen.getByText(/450,00/)).toBeInTheDocument();
    expect(screen.getByText('A sculpted boot.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /también te puede gustar/i })).toHaveTextContent('Leather Tee');
  });

  it('al cambiar de color la galería prioriza sus imágenes y los talles agotados se deshabilitan', async () => {
    server.use(http.get('/api/catalog/products/sharp-leather-boot', () => HttpResponse.json(detail())));
    open();
    const gallery = await screen.findByRole('region', { name: /galería/i });
    expect(within(gallery).getAllByRole('img')[0]).toHaveAttribute('alt', 'Black front');

    await userEvent.click(screen.getByRole('radio', { name: 'Oxblood Burgundy' }));
    expect(within(gallery).getAllByRole('img')[0]).toHaveAttribute('alt', 'Oxblood front');
    expect(screen.getByRole('radio', { name: /^S/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^M/ })).toBeEnabled();
  });

  it('producto inexistente → página de no encontrado con link a la tienda', async () => {
    server.use(http.get('/api/catalog/products/nope', () => problem(404, 'PRODUCT_NOT_FOUND', 'El producto no existe')));
    open('nope');
    expect(await screen.findByRole('heading', { name: /no encontramos/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ir a la tienda/i })).toHaveAttribute('href', '/tienda');
  });
});
