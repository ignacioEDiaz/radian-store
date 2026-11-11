import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { CartLineView, CartView } from '@radian/contracts';
import { server } from '../../test/server';
import { renderWithProviders } from '../../test/render';
import { problem } from '../../test/fixtures';
import { CartPage } from './CartPage';

const line = (over: Partial<CartLineView> = {}): CartLineView => ({
  lineId: 'l1',
  variantId: 'v1',
  productSlug: 'sable-blazer',
  title: 'Sable Blazer',
  color: 'Obsidian Black',
  size: 'S',
  image: null,
  quantity: 1,
  unitPriceCents: 10_000,
  previousUnitPriceCents: null,
  lineTotalCents: 10_000,
  available: true,
  maxQuantity: 5,
  warnings: [],
  ...over,
});
const cart = (...lines: CartLineView[]): CartView => ({
  id: 'c1',
  lines,
  itemCount: lines.reduce((n, l) => n + l.quantity, 0),
  subtotalCents: lines.reduce((n, l) => n + l.lineTotalCents, 0),
  currency: 'USD',
});

describe('CartPage', () => {
  it('lista las líneas con totales y cuánto falta para el envío gratis', async () => {
    server.use(http.get('/api/cart', () => HttpResponse.json(cart(line()))));
    renderWithProviders(<CartPage />);
    const item = (await screen.findByRole('link', { name: 'Sable Blazer' })).closest('li')!;
    expect(within(item).getByText('Color: Obsidian Black · Talle: S')).toBeInTheDocument();
    expect(within(item).getAllByText('US$ 100,00')).toHaveLength(2);
    expect(screen.getByText('Sumá US$ 50,00 y el envío es gratis.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /finalizar compra/i })).toHaveAttribute('href', '/checkout');
  });

  it('cambia la cantidad de forma optimista y la confirma con el carrito del servidor', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.get('/api/cart', () => HttpResponse.json(cart(line()))),
      http.patch('/api/cart/items/l1', async ({ request }) => {
        const { quantity } = (await request.json()) as { quantity: number };
        await gate;
        return HttpResponse.json(cart(line({ quantity, lineTotalCents: 10_000 * quantity })));
      }),
    );
    renderWithProviders(<CartPage />);
    await userEvent.click(await screen.findByRole('button', { name: /sumar una unidad/i }));
    // Todavía no respondió el servidor y la pantalla ya muestra el cambio.
    expect(screen.getByText('¡Tenés envío gratis!')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /cantidad/i })).toHaveTextContent('2');
    release();
    expect(await screen.findByText('(2)')).toBeInTheDocument();
  });

  it('si la API rechaza el cambio, vuelve al estado anterior y explica por qué', async () => {
    server.use(
      http.get('/api/cart', () => HttpResponse.json(cart(line()))),
      http.patch('/api/cart/items/l1', () => problem(409, 'INSUFFICIENT_STOCK', 'No hay stock suficiente')),
    );
    renderWithProviders(<CartPage />);
    await userEvent.click(await screen.findByRole('button', { name: /sumar una unidad/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay stock suficiente');
    expect(screen.getByRole('group', { name: /cantidad/i })).toHaveTextContent('1');
  });

  it('quitar el último producto deja el estado vacío; con líneas sin stock no deja avanzar', async () => {
    server.use(
      http.get('/api/cart', () => HttpResponse.json(cart(line({ available: false, warnings: ['OUT_OF_STOCK'] })))),
      http.delete('/api/cart/items/l1', () => HttpResponse.json(cart())),
    );
    renderWithProviders(<CartPage />);
    expect(await screen.findByText(/quitá los productos sin stock/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /finalizar compra/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /quitar sable blazer/i }));
    expect(await screen.findByText('Tu carrito está vacío.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /seguir comprando/i })).toHaveAttribute('href', '/collections/all');
  });
});
