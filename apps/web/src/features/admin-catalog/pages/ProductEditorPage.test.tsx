import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import { renderWithProviders } from '../../../test/render';
import { problem } from '../../../test/fixtures';
import { ProductEditorPage } from './ProductEditorPage';
import { PRODUCT_ID, adminProduct, image, variant } from '../test-data';

const editor = (id = PRODUCT_ID) =>
  renderWithProviders(<ProductEditorPage />, {
    route: `/admin/productos/${id}`,
    path: '/admin/productos/:id',
  });

describe('ProductEditorPage', () => {
  it('crea un producto y navega a su edición', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/admin/products', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(adminProduct(), { status: 201 });
      }),
      http.get(`/api/admin/products/${PRODUCT_ID}`, () => HttpResponse.json(adminProduct())),
    );
    renderWithProviders(<ProductEditorPage />, {
      route: '/admin/productos/nuevo',
      path: '/admin/productos/:id',
    });
    await userEvent.type(screen.getByLabelText(/^título/i), 'Sharp Leather Boot');
    await userEvent.type(screen.getByLabelText(/^tipo/i), 'Footwear');
    await userEvent.type(screen.getByLabelText(/^precio \(US\$\)/i), '450');
    await userEvent.click(screen.getByRole('button', { name: /crear producto/i }));
    expect(await screen.findByRole('heading', { name: 'Sharp Leather Boot' })).toBeInTheDocument();
    expect(body).toMatchObject({ title: 'Sharp Leather Boot', productType: 'Footwear', priceCents: 45000, compareAtCents: null });
  });

  it('agrega una variante con stock y la tabla se actualiza con la respuesta del comando', async () => {
    let sent: Record<string, unknown> | undefined;
    server.use(
      http.get(`/api/admin/products/${PRODUCT_ID}`, () => HttpResponse.json(adminProduct())),
      http.post(`/api/admin/products/${PRODUCT_ID}/variants`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(adminProduct({ version: 2, variants: [variant('v1', 'SB-BL-S', 5)] }), { status: 201 });
      }),
    );
    editor();
    const form = await screen.findByRole('form', { name: /nueva variante/i });
    await userEvent.type(within(form).getByLabelText('SKU'), 'sb-bl-s');
    await userEvent.type(within(form).getByLabelText('Color'), 'Black');
    await userEvent.type(within(form).getByLabelText('Talle'), 'S');
    await userEvent.clear(within(form).getByLabelText(/stock inicial/i));
    await userEvent.type(within(form).getByLabelText(/stock inicial/i), '5');
    await userEvent.click(within(form).getByRole('button', { name: /agregar/i }));
    expect(await screen.findByRole('row', { name: /SB-BL-S/ })).toHaveTextContent('5');
    expect(sent).toMatchObject({ expectedVersion: 1, sku: 'sb-bl-s', initialStock: 5 });
  });

  it('al publicar sin requisitos muestra los motivos en español', async () => {
    server.use(
      http.get(`/api/admin/products/${PRODUCT_ID}`, () => HttpResponse.json(adminProduct())),
      http.post(`/api/admin/products/${PRODUCT_ID}/publish`, () =>
        problem(422, 'NOT_PUBLISHABLE', 'El producto no se puede publicar todavía', { meta: { reasons: ['NO_VARIANTS', 'NO_IMAGES'] } }),
      ),
    );
    editor();
    await userEvent.click(await screen.findByRole('button', { name: /^publicar$/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/al menos una variante/i);
    expect(alert).toHaveTextContent(/al menos una imagen/i);
  });

  it('conflicto de versión: avisa y permite recargar', async () => {
    let gets = 0;
    server.use(
      http.get(`/api/admin/products/${PRODUCT_ID}`, () => {
        gets += 1;
        return HttpResponse.json(adminProduct({ version: gets === 1 ? 1 : 5, title: gets === 1 ? 'Sharp Leather Boot' : 'Editado por otra persona' }));
      }),
      http.patch(`/api/admin/products/${PRODUCT_ID}`, () => problem(409, 'VERSION_CONFLICT', 'El producto fue modificado por otra persona.')),
    );
    editor();
    const title = await screen.findByLabelText(/^título/i);
    await userEvent.clear(title);
    await userEvent.type(title, 'Nuevo título');
    await userEvent.click(screen.getByRole('button', { name: /guardar datos/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/modificado por otra persona/i);
    await userEvent.click(screen.getByRole('button', { name: /recargar/i }));
    expect(await screen.findByRole('heading', { name: 'Editado por otra persona' })).toBeInTheDocument();
  });

  it('ajusta stock de una variante', async () => {
    let adjustment: unknown;
    server.use(
      http.get(`/api/admin/products/${PRODUCT_ID}`, () => HttpResponse.json(adminProduct({ variants: [variant('11111111-1111-4111-8111-000000000001', 'SB-1', 3)] }))),
      http.post('/api/admin/inventory/:variantId/adjustments', async ({ request }) => {
        adjustment = await request.json();
        return HttpResponse.json({ variantId: '11111111-1111-4111-8111-000000000001', onHand: 13, reserved: 0, available: 13 });
      }),
    );
    editor();
    const row = await screen.findByRole('row', { name: /SB-1/ });
    await userEvent.type(within(row).getByLabelText(/ajuste/i), '10');
    await userEvent.click(within(row).getByRole('button', { name: /aplicar/i }));
    expect(await within(row).findByText('13')).toBeInTheDocument();
    expect(adjustment).toEqual({ delta: 10, reason: 'restock' });
  });

  it('sube una imagen (multipart) y la adjunta; reordena con botones accesibles', async () => {
    const calls: string[] = [];
    let order: unknown;
    const withImages = adminProduct({ version: 3, images: [{ ...image('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Frente'), position: 0 }, { ...image('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Lado'), position: 1 }] });
    server.use(
      http.get(`/api/admin/products/${PRODUCT_ID}`, () => HttpResponse.json(adminProduct())),
      http.post('/api/admin/media', async ({ request }) => {
        calls.push(`media:${request.headers.get('content-type')?.split(';')[0]}`);
        return HttpResponse.json({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', url: '/media/x/640.webp', width: 800, height: 1000, widths: [320], mimeType: 'image/png', bytes: 1 }, { status: 201 });
      }),
      http.post(`/api/admin/products/${PRODUCT_ID}/images`, () => {
        calls.push('attach');
        return HttpResponse.json(withImages, { status: 201 });
      }),
      http.put(`/api/admin/products/${PRODUCT_ID}/images/order`, async ({ request }) => {
        order = await request.json();
        return HttpResponse.json(withImages);
      }),
    );
    editor();
    const input = await screen.findByLabelText(/subir imagen/i);
    await userEvent.upload(input, new File(['x'], 'foto.png', { type: 'image/png' }));
    expect(await screen.findByRole('img', { name: 'Lado' })).toBeInTheDocument();
    expect(calls).toEqual(['media:multipart/form-data', 'attach']);
    await userEvent.click(screen.getByRole('button', { name: /subir "lado"/i }));
    await screen.findByRole('img', { name: 'Lado' });
    expect(order).toEqual({ expectedVersion: 3, imageIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] });
  });
});
