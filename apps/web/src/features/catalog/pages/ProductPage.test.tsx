import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import { renderWithProviders } from '../../../test/render';
import { problem } from '../../../test/fixtures';
import { detail } from '../test-data';
import { ProductPage } from './ProductPage';

const open = (slug = 'sharp-leather-boot', query = '') =>
  renderWithProviders(<ProductPage />, { route: `/products/${slug}${query}`, path: '/products/:slug' });
const useProduct = () => server.use(http.get('/api/catalog/products/sharp-leather-boot', () => HttpResponse.json(detail())));

type AddLines = (items: { id: string; quantity: number }[], options?: unknown) => Promise<unknown>;
/** El carrito del tema (lo provee su JavaScript en el navegador). */
function stubThemeCart(addLines: AddLines) {
  (window as unknown as { AxiomStandardStorefront?: { addLines: AddLines } }).AxiomStandardStorefront = { addLines };
}

afterEach(() => {
  delete (window as unknown as { AxiomStandardStorefront?: unknown }).AxiomStandardStorefront;
});

describe('ProductPage', () => {
  it('muestra título, precio con oferta, descripción y relacionados', async () => {
    useProduct();
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Sharp Leather Boot' })).toBeInTheDocument();
    const price = screen.getByRole('status');
    expect(price).toHaveTextContent('US$ 450,00');
    expect(price.querySelector('s')).toHaveTextContent('US$ 576,92');
    expect(screen.getByText('A sculpted boot.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /también te puede gustar/i })).toHaveTextContent('Leather Tee');
    expect(document.title).toContain('Sharp Leather Boot');
  });

  it('preselecciona color y talle con stock; al cambiar de color prioriza sus fotos y marca talles agotados', async () => {
    useProduct();
    open();
    const gallery = await screen.findByRole('list', { name: 'Sharp Leather Boot' });
    expect(within(gallery).getAllByRole('img')[0]).toHaveAttribute('alt', 'Black front');
    expect(screen.getByRole('button', { name: 'Obsidian Black' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Talle S' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Oxblood Burgundy' }));
    expect(within(gallery).getAllByRole('img')[0]).toHaveAttribute('alt', 'Oxblood front');
    // S está agotado en ese color: se marca y se pasa al primer talle con stock.
    expect(screen.getByRole('button', { name: 'Talle S, agotado' })).toHaveClass('unavailable');
    expect(screen.getByRole('button', { name: 'Talle M' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /agregar al carrito/i })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Talle S, agotado' }));
    expect(screen.getByRole('button', { name: 'Agotado' })).toBeDisabled();
  });

  it('`?color=` abre el producto en ese color (links de las tarjetas)', async () => {
    useProduct();
    open('sharp-leather-boot', '?color=Oxblood%20Burgundy');
    expect(await screen.findByRole('button', { name: 'Oxblood Burgundy' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('agrega al carrito por el camino del tema, con la variante y cantidad elegidas (tope: stock)', async () => {
    useProduct();
    const addLines = vi.fn<AddLines>(async () => ({}));
    stubThemeCart(addLines);
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Talle M' }));
    const plus = screen.getByRole('button', { name: 'Sumar una unidad' });
    await userEvent.click(plus);
    // El talle M tiene 2 unidades: no deja pedir una tercera.
    expect(plus).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /agregar al carrito/i }));
    expect(addLines).toHaveBeenCalledWith([{ id: 'v2', quantity: 2 }], expect.objectContaining({ source: 'app' }));
    expect(await screen.findByRole('button', { name: 'Agregado' })).toBeInTheDocument();
  });

  it('muestra el motivo cuando el backend rechaza el agregado', async () => {
    useProduct();
    stubThemeCart(vi.fn<AddLines>(async () => Promise.reject(new Error('No hay stock suficiente'))));
    open();
    await userEvent.click(await screen.findByRole('button', { name: /agregar al carrito/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay stock suficiente');
    expect(screen.getByRole('button', { name: /agregar al carrito/i })).toBeEnabled();
  });

  it('producto inexistente → página de no encontrado con link al catálogo', async () => {
    server.use(http.get('/api/catalog/products/nope', () => problem(404, 'PRODUCT_NOT_FOUND', 'El producto no existe')));
    open('nope');
    expect(await screen.findByRole('heading', { name: /no encontramos/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver todos los productos/i })).toHaveAttribute('href', '/collections/all');
  });
});
