import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import type { CartView } from '@radian/contracts';
import { server } from '../../test/server';
import { renderWithProviders } from '../../test/render';
import { problem } from '../../test/fixtures';
import { detail } from '../catalog/test-data';
import { CartDrawerProvider } from './components/CartDrawerContext';
import { CartButton } from './components/CartButton';
import { CartDrawer } from './components/CartDrawer';
import { AddToCart } from './components/AddToCart';

const empty: CartView = { id: null, lines: [], itemCount: 0, subtotalCents: 0, currency: 'USD' };
const line = (over = {}) => ({
  lineId: 'l1',
  variantId: 'v1',
  productSlug: 'sharp-leather-boot',
  title: 'Sharp Leather Boot',
  color: 'Obsidian Black',
  size: 'S',
  image: null,
  quantity: 1,
  unitPriceCents: 45_000,
  previousUnitPriceCents: null,
  lineTotalCents: 45_000,
  available: true,
  maxQuantity: 3,
  warnings: [],
  ...over,
});
const cartWith = (lines: ReturnType<typeof line>[]): CartView => ({
  id: 'c1',
  lines,
  itemCount: lines.reduce((n, l) => n + (l.available ? l.quantity : 0), 0),
  subtotalCents: lines.reduce((n, l) => n + l.lineTotalCents, 0),
  currency: 'USD',
});

function shop(variant: ReturnType<typeof detail>['variants'][number] | null) {
  const product = detail();
  return renderWithProviders(
    <CartDrawerProvider>
      <CartButton />
      <AddToCart product={product} variant={variant} />
      <CartDrawer />
    </CartDrawerProvider>,
  );
}

describe('AddToCart + CartButton', () => {
  it('sin talle elegido el botón pide elegir', async () => {
    server.use(http.get('/api/cart', () => HttpResponse.json(empty)));
    shop(null);
    expect(screen.getByRole('button', { name: /elegí un talle/i })).toBeDisabled();
  });

  it('actualiza el contador al instante (optimista), luego reemplaza con el carrito del servidor y abre el panel', async () => {
    server.use(
      http.get('/api/cart', () => HttpResponse.json(empty)),
      http.post('/api/cart/items', async () => {
        await delay(300);
        return HttpResponse.json(cartWith([line()]));
      }),
    );
    shop(detail().variants[0]!);
    expect(await screen.findByRole('button', { name: /carrito, 0 productos/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /agregar al carrito/i }));
    expect(screen.getByRole('button', { name: /carrito, 1 producto/i })).toBeInTheDocument();
    const drawer = await screen.findByRole('dialog', { name: /tu carrito/i });
    expect(await within(drawer).findByText('Sharp Leather Boot')).toBeInTheDocument();
    expect(within(drawer).getAllByText(/450,00/).length).toBeGreaterThan(0);
  });

  it('si la API rechaza, revierte el contador y muestra el motivo', async () => {
    server.use(
      http.get('/api/cart', () => HttpResponse.json(empty)),
      http.post('/api/cart/items', async () => {
        await delay(50);
        return problem(422, 'INSUFFICIENT_STOCK', 'Solo quedan 2 unidades', { meta: { available: 2 } });
      }),
    );
    shop(detail().variants[0]!);
    await screen.findByRole('button', { name: /carrito, 0 productos/i });
    await userEvent.click(screen.getByRole('button', { name: /agregar al carrito/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Solo quedan 2 unidades');
    expect(screen.getByRole('button', { name: /carrito, 0 productos/i })).toBeInTheDocument();
  });
});

describe('CartDrawer', () => {
  it('cambia cantidad dentro del máximo, quita líneas y muestra el estado vacío', async () => {
    let patched: unknown;
    server.use(
      http.get('/api/cart', () => HttpResponse.json(cartWith([line()]))),
      http.patch('/api/cart/items/l1', async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json(cartWith([line({ quantity: 2, lineTotalCents: 90_000 })]));
      }),
      http.delete('/api/cart/items/l1', () => HttpResponse.json(empty)),
    );
    shop(null);
    await userEvent.click(await screen.findByRole('button', { name: /carrito, 1 producto/i }));
    const drawer = await screen.findByRole('dialog', { name: /tu carrito/i });
    await userEvent.click(within(drawer).getByRole('button', { name: /sumar una unidad/i }));
    expect((await within(drawer).findAllByText(/900,00/)).length).toBeGreaterThan(0);
    expect(patched).toEqual({ quantity: 2 });
    await userEvent.click(within(drawer).getByRole('button', { name: /quitar sharp leather boot/i }));
    expect(await within(drawer).findByText(/tu carrito está vacío/i)).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: /seguir comprando/i })).toHaveAttribute('href', '/tienda');
  });

  it('muestra avisos de precio cambiado y de agotado', async () => {
    server.use(
      http.get('/api/cart', () =>
        HttpResponse.json(
          cartWith([
            line({ previousUnitPriceCents: 50_000, warnings: ['PRICE_CHANGED'] }),
            line({ lineId: 'l2', title: 'Ghost Mesh', available: false, lineTotalCents: 0, maxQuantity: 0, warnings: ['OUT_OF_STOCK'] }),
          ]),
        ),
      ),
    );
    shop(null);
    await userEvent.click(await screen.findByRole('button', { name: /carrito/i }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText(/el precio cambió/i)).toBeInTheDocument();
    expect(within(drawer).getByText(/sin stock/i)).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: /finalizar compra/i })).toHaveAttribute('href', '/checkout');
  });
});
