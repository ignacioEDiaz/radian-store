import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { renderWithProviders } from '../../test/render';
import { order } from '../checkout/test-data';
import { OrdersPage } from './OrdersPage';
import { OrderDetailPage } from './OrderDetailPage';
import { AdminOrdersPage, AdminOrderDetailPage } from './AdminOrdersPages';

describe('Mis pedidos', () => {
  it('lista pedidos del más reciente al más antiguo con estado y total', async () => {
    server.use(
      http.get('/api/orders', () =>
        HttpResponse.json({
          items: [
            {
              id: '2',
              number: 'RS-001002',
              status: 'shipped',
              email: 'a',
              totalCents: 36_000,
              itemCount: 1,
              placedAt: '2026-11-11T10:00:00.000Z',
            },
            {
              id: '1',
              number: 'RS-001001',
              status: 'paid',
              email: 'a',
              totalCents: 45_000,
              itemCount: 2,
              placedAt: '2026-11-10T10:00:00.000Z',
            },
          ],
          total: 2,
          page: 1,
          pageSize: 10,
        }),
      ),
    );
    renderWithProviders(<OrdersPage />);
    const rows = await screen.findAllByRole('row');
    expect(rows[1]).toHaveTextContent('RS-001002');
    expect(rows[1]).toHaveTextContent('Enviado');
    expect(rows[2]).toHaveTextContent('Pagado');
    expect(within(rows[2]!).getByRole('link', { name: 'RS-001001' })).toHaveAttribute(
      'href',
      '/cuenta/pedidos/RS-001001',
    );
  });

  it('detalle con líneas, totales, pago y seguimiento', async () => {
    server.use(
      http.get('/api/orders/RS-001001', () =>
        HttpResponse.json(order({ status: 'shipped', trackingCode: 'AR123' })),
      ),
    );
    renderWithProviders(<OrderDetailPage />, {
      route: '/cuenta/pedidos/RS-001001',
      path: '/cuenta/pedidos/:number',
    });
    expect(await screen.findByRole('heading', { name: /RS-001001/ })).toBeInTheDocument();
    expect(await screen.findByText(/AR123/)).toBeInTheDocument();
    expect(screen.getByText(/visa terminada en 4242/i)).toBeInTheDocument();
    expect(screen.getAllByText(/450,00/).length).toBeGreaterThan(0);
  });
});

describe('Administración de pedidos', () => {
  it('filtra por estado', async () => {
    const urls: string[] = [];
    server.use(
      http.get('/api/admin/orders', ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({
          items: [
            {
              id: '1',
              number: 'RS-001001',
              status: 'paid',
              email: 'ana@example.com',
              totalCents: 45_000,
              itemCount: 1,
              placedAt: '2026-11-10T10:00:00.000Z',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        });
      }),
    );
    renderWithProviders(<AdminOrdersPage />);
    expect(await screen.findByText('ana@example.com')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/estado/i), 'paid');
    await screen.findByText('ana@example.com');
    expect(urls.at(-1)).toContain('status=paid');
  });

  it('marca como enviado con código de seguimiento y cancela con motivo', async () => {
    let shipBody: unknown;
    server.use(
      http.get('/api/admin/orders/RS-001001', () => HttpResponse.json(order())),
      http.post('/api/admin/orders/RS-001001/ship', async ({ request }) => {
        shipBody = await request.json();
        return HttpResponse.json(order({ status: 'shipped', trackingCode: 'AR999', version: 3 }));
      }),
    );
    renderWithProviders(<AdminOrderDetailPage />, {
      route: '/admin/pedidos/RS-001001',
      path: '/admin/pedidos/:number',
    });
    await userEvent.type(await screen.findByLabelText(/código de seguimiento/i), 'AR999');
    await userEvent.click(screen.getByRole('button', { name: /marcar como enviado/i }));
    expect(await screen.findByText(/enviado/i, { selector: '[data-status]' })).toBeInTheDocument();
    expect(shipBody).toEqual({ expectedVersion: 2, trackingCode: 'AR999' });
    expect(screen.queryByRole('button', { name: /cancelar pedido/i })).not.toBeInTheDocument();
  });
});
