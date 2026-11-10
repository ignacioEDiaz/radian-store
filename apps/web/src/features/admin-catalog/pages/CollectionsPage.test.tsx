import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import { renderWithProviders } from '../../../test/render';
import { CollectionsPage } from './CollectionsPage';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';

describe('CollectionsPage', () => {
  it('crea una colección y define sus productos en orden', async () => {
    const collections = [{ id: 'c1', slug: 'tops', title: 'Tops', description: '', imageMediaId: null, imageUrl: null, productIds: [P1], version: 2 }];
    let setBody: unknown;
    let created: unknown;
    server.use(
      http.get('/api/admin/collections', () => HttpResponse.json(collections)),
      http.get('/api/admin/products', () =>
        HttpResponse.json({
          items: [
            { id: P1, slug: 'a', title: 'Alpha', status: 'published', priceCents: 1, imageUrl: null, variantCount: 1, totalStock: 1, updatedAt: '' },
            { id: P2, slug: 'b', title: 'Beta', status: 'published', priceCents: 1, imageUrl: null, variantCount: 1, totalStock: 1, updatedAt: '' },
          ],
          total: 2,
          page: 1,
          pageSize: 50,
        }),
      ),
      http.post('/api/admin/collections', async ({ request }) => {
        created = await request.json();
        return HttpResponse.json({ id: 'c2', slug: 'nueva', title: 'Nueva', description: '', imageMediaId: null, imageUrl: null, productIds: [], version: 1 }, { status: 201 });
      }),
      http.put('/api/admin/collections/c1/products', async ({ request }) => {
        setBody = await request.json();
        return HttpResponse.json({ ...collections[0], productIds: [P1, P2], version: 3 });
      }),
    );
    renderWithProviders(<CollectionsPage />);
    const card = await screen.findByRole('region', { name: 'Tops' });
    expect(within(card).getByText('Alpha')).toBeInTheDocument();
    await userEvent.selectOptions(within(card).getByLabelText(/agregar producto/i), P2);
    await userEvent.click(within(card).getByRole('button', { name: /guardar productos/i }));
    expect(await within(card).findByText('Beta')).toBeInTheDocument();
    expect(setBody).toEqual({ expectedVersion: 2, productIds: [P1, P2] });

    await userEvent.type(screen.getByLabelText(/título de la colección/i), 'Nueva');
    await userEvent.click(screen.getByRole('button', { name: /crear colección/i }));
    expect(created).toMatchObject({ title: 'Nueva' });
  });
});
