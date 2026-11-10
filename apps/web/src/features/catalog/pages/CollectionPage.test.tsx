import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useLocation } from 'react-router';
import { server } from '../../../test/server';
import { renderWithProviders } from '../../../test/render';
import { card, list } from '../test-data';
import { CollectionPage } from './CollectionPage';

function LocationProbe() {
  const l = useLocation();
  return <output data-testid="location">{l.pathname + l.search}</output>;
}

function page(route = '/tienda') {
  return renderWithProviders(
    <>
      <CollectionPage />
      <LocationProbe />
    </>,
    { route, path: '/tienda' },
  );
}

describe('CollectionPage', () => {
  it('muestra tarjetas con precio, precio anterior, agotado y nuevo', async () => {
    server.use(
      http.get('/api/catalog/products', () =>
        HttpResponse.json(list([card(1, { title: 'Sharp Boot', priceCents: 45_000, compareAtCents: 57_692, isNew: true }), card(2, { title: 'Ghost Mesh', available: false })], { total: 2 })),
      ),
    );
    page();
    const boot = await screen.findByRole('article', { name: 'Sharp Boot' });
    expect(within(boot).getByText(/450,00/)).toBeInTheDocument();
    expect(within(boot).getByText(/576,92/)).toBeInTheDocument();
    expect(within(boot).getByText('Nuevo')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Ghost Mesh' })).getByText('Agotado')).toBeInTheDocument();
    // imagen decorativa (alt vacío): el título ya es el link accesible
    expect(boot.querySelector('img')).toHaveAttribute('srcset', expect.stringContaining('320w'));
    expect(screen.getByText('2 productos')).toBeInTheDocument();
  });

  it('los filtros viven en la URL y se envían a la API; las facetas muestran conteos', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/catalog/products', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json(list([card(1)]));
      }),
    );
    page('/tienda?sort=price_asc');
    const color = await screen.findByRole('checkbox', { name: /oxblood burgundy \(5\)/i });
    await userEvent.click(color);
    expect(screen.getByTestId('location')).toHaveTextContent('color=Oxblood+Burgundy');
    expect(screen.getByTestId('location')).toHaveTextContent('sort=price_asc');
    await userEvent.click(screen.getByRole('checkbox', { name: /^M \(9\)/ }));
    await screen.findAllByRole('article');
    expect(seen.at(-1)).toContain('color=Oxblood+Burgundy');
    expect(seen.at(-1)).toContain('size=M');
    await userEvent.selectOptions(screen.getByLabelText(/ordenar/i), 'newest');
    expect(screen.getByTestId('location')).toHaveTextContent('sort=newest');
  });

  it('pagina y conserva los filtros', async () => {
    server.use(
      http.get('/api/catalog/products', ({ request }) => {
        const p = Number(new URL(request.url).searchParams.get('page') ?? '1');
        return HttpResponse.json(list([card(p * 100)], { total: 30, page: p }));
      }),
    );
    page('/tienda?color=Obsidian+Black');
    await userEvent.click(await screen.findByRole('link', { name: /siguiente/i }));
    expect(await screen.findByRole('article', { name: 'Product 200' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('color=Obsidian+Black');
    expect(screen.getByTestId('location')).toHaveTextContent('page=2');
  });

  it('estado vacío y error con reintento', async () => {
    server.use(http.get('/api/catalog/products', () => HttpResponse.json(list([], { total: 0 }))));
    page('/tienda?color=Nada');
    expect(await screen.findByText(/no encontramos productos/i)).toBeInTheDocument();

    server.use(http.get('/api/catalog/products', () => HttpResponse.json({ code: 'X', status: 500, title: 'x', type: 'x' }, { status: 500 })));
    page('/tienda?q=error');
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 });
    server.use(http.get('/api/catalog/products', () => HttpResponse.json(list([card(9)]))));
    await userEvent.click(within(alert).getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('article', { name: 'Product 9' })).toBeInTheDocument();
  });
});
