import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useLocation } from 'react-router';
import { server } from '../../../test/server';
import { renderWithProviders } from '../../../test/render';
import { problem } from '../../../test/fixtures';
import { card, list } from '../test-data';
import { CollectionPage } from './CollectionPage';

function LocationProbe() {
  const l = useLocation();
  return <output data-testid="location">{l.pathname + l.search}</output>;
}

function page(route = '/collections/all', mode: 'shop' | 'search' = 'shop') {
  return renderWithProviders(
    <>
      <CollectionPage mode={mode} />
      <LocationProbe />
    </>,
    { route, path: mode === 'search' ? '/search' : '/collections/:slug' },
  );
}

/** Tarjeta del tema que contiene el link con ese título. */
const cardOf = async (title: string) => (await screen.findByRole('link', { name: title })).closest<HTMLElement>('.product-card')!;

describe('CollectionPage', () => {
  it('muestra las tarjetas con el markup del tema: precio, precio anterior, oferta y agotado', async () => {
    server.use(
      http.get('/api/catalog/products', () =>
        HttpResponse.json(list([card(1, { title: 'Sharp Boot', priceCents: 45_000, compareAtCents: 57_692 }), card(2, { title: 'Ghost Mesh', available: false })], { total: 2 })),
      ),
    );
    page();
    const boot = await cardOf('Sharp Boot');
    expect(within(boot).getByText('US$ 450,00')).toBeInTheDocument();
    expect(boot.querySelector('s')).toHaveTextContent('US$ 576,92');
    expect(within(boot).getByText('Oferta')).toBeVisible();
    expect(within(boot).getByText('Agotado')).not.toBeVisible();
    expect(within(boot).getByRole('link', { name: 'Sharp Boot' })).toHaveAttribute('href', '/products/product-1');
    expect(boot.querySelector('img')).toHaveAttribute('srcset', expect.stringContaining('320w'));

    const mesh = await cardOf('Ghost Mesh');
    expect(within(mesh).getByText('Agotado')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Productos' })).toBeInTheDocument();
    expect(screen.getByText('Mostrando 2 de 2')).toBeInTheDocument();
  });

  it('`/collections/all` lista todo; una colección envía su slug y muestra su título', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get('/api/catalog/products', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('collection'));
        return HttpResponse.json(list([card(1)]));
      }),
      http.get('/api/catalog/collections/dresses', () => HttpResponse.json({ id: 'c1', slug: 'dresses', title: 'Dresses', description: 'Fluid forms.', image: null, productCount: 1 })),
    );
    const first = page('/collections/all');
    await cardOf('Product 1');
    expect(seen).toEqual([null]);
    first.unmount();

    page('/collections/dresses');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dresses' })).toBeInTheDocument();
    expect(screen.getByText('Fluid forms.')).toBeInTheDocument();
    expect(seen.at(-1)).toBe('dresses');
  });

  it('los filtros y el orden viven en la URL y se envían a la API; las facetas muestran conteos', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/catalog/products', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json(list([card(1)]));
      }),
    );
    page('/collections/all?sort=price_asc');
    await cardOf('Product 1');

    await userEvent.click(screen.getByRole('button', { name: /^color/i }));
    const color = screen.getByRole('checkbox', { name: /oxblood burgundy\s*5/i });
    await userEvent.click(color);
    expect(screen.getByTestId('location')).toHaveTextContent('color=Oxblood+Burgundy');
    expect(screen.getByTestId('location')).toHaveTextContent('sort=price_asc');

    await userEvent.click(screen.getByRole('button', { name: /^talle/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Talle M' }));
    await cardOf('Product 1');
    expect(seen.at(-1)).toContain('color=Oxblood+Burgundy');
    expect(seen.at(-1)).toContain('size=M');
    expect(screen.getByText(/filtros activos: 2/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /ordenar por/i }));
    await userEvent.click(screen.getByRole('option', { name: 'Novedades' }));
    expect(screen.getByTestId('location')).toHaveTextContent('sort=newest');

    await userEvent.click(screen.getByRole('button', { name: /quitar todos los filtros/i }));
    expect(screen.getByTestId('location')).not.toHaveTextContent('color=');
    expect(screen.getByTestId('location')).toHaveTextContent('sort=newest');
  });

  it('"Cargar más" suma la página siguiente conservando los filtros', async () => {
    const pages: string[] = [];
    server.use(
      http.get('/api/catalog/products', ({ request }) => {
        const url = new URL(request.url);
        const p = Number(url.searchParams.get('page') ?? '1');
        pages.push(`${p}:${url.searchParams.get('color')}`);
        return HttpResponse.json(list([card(p * 100)], { total: 30, page: p }));
      }),
    );
    page('/collections/all?color=Obsidian+Black');
    await cardOf('Product 100');
    expect(screen.getByText('Mostrando 1 de 30')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /cargar más/i }));
    await cardOf('Product 200');
    expect(screen.getByRole('link', { name: 'Product 100' })).toBeInTheDocument();
    expect(pages).toEqual(['1:Obsidian Black', '2:Obsidian Black']);
    expect(screen.queryByRole('button', { name: /cargar más/i })).not.toBeInTheDocument();
  });

  it('búsqueda: usa el término de la URL y avisa cuando no hay resultados', async () => {
    let q: string | null = null;
    server.use(
      http.get('/api/catalog/products', ({ request }) => {
        q = new URL(request.url).searchParams.get('q');
        return HttpResponse.json(list([], { total: 0 }));
      }),
    );
    page('/search?q=botas', 'search');
    expect(await screen.findByText('No encontramos productos para “botas”.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Resultados para “botas”' })).toBeInTheDocument();
    expect(q).toBe('botas');
  });

  it('error con reintento y colección inexistente', async () => {
    server.use(http.get('/api/catalog/products', () => HttpResponse.json({ code: 'X', status: 500, title: 'x', type: 'x' }, { status: 500 })));
    const failed = page('/collections/all?color=x');
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 });
    server.use(http.get('/api/catalog/products', () => HttpResponse.json(list([card(9)]))));
    await userEvent.click(within(alert).getByRole('button', { name: /reintentar/i }));
    await cardOf('Product 9');
    failed.unmount();

    server.use(
      http.get('/api/catalog/collections/nope', () => problem(404, 'COLLECTION_NOT_FOUND', 'La colección no existe')),
      http.get('/api/catalog/products', () => HttpResponse.json(list([], { total: 0 }))),
    );
    page('/collections/nope');
    expect(await screen.findByText(/esa colección no existe/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver todos los productos/i })).toHaveAttribute('href', '/collections/all');
  });
});
