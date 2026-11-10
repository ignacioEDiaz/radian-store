import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import { renderWithProviders } from '../../../test/render';
import { ProductsListPage } from './ProductsListPage';

const row = (id: string, title: string, status: string) => ({
  id,
  slug: title.toLowerCase(),
  title,
  status,
  priceCents: 45000,
  imageUrl: null,
  variantCount: 8,
  totalStock: 30,
  updatedAt: '2026-11-10T12:00:00.000Z',
});

describe('ProductsListPage', () => {
  it('lista productos con estado, precio y stock, y filtra por estado', async () => {
    const urls: string[] = [];
    server.use(
      http.get('/api/admin/products', ({ request }) => {
        urls.push(request.url);
        const status = new URL(request.url).searchParams.get('status');
        const items = status === 'draft' ? [row('2', 'Borrador', 'draft')] : [row('1', 'Sharp Boot', 'published'), row('2', 'Borrador', 'draft')];
        return HttpResponse.json({ items, total: items.length, page: 1, pageSize: 50 });
      }),
    );
    renderWithProviders(<ProductsListPage />);
    const first = await screen.findByRole('row', { name: /sharp boot/i });
    expect(within(first).getByText('Publicado')).toBeInTheDocument();
    expect(within(first).getByText(/450/)).toBeInTheDocument();
    expect(within(first).getByText('30')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /nuevo producto/i })).toHaveAttribute('href', '/admin/productos/nuevo');

    await userEvent.selectOptions(screen.getByLabelText(/estado/i), 'draft');
    expect(await screen.findByText('1 producto')).toBeInTheDocument();
    expect(urls.at(-1)).toContain('status=draft');
  });
});
