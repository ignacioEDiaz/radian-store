import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../test/server';
import { renderWithProviders } from '../../test/render';
import { customerProfile, problem, unauthenticated } from '../../test/fixtures';
import { order, quote } from './test-data';
import { CheckoutPage } from './CheckoutPage';

function setup(profile: unknown = { ...customerProfile, defaultAddress: { recipient: 'Ana Pérez', line1: 'Av. Corrientes 1234', city: 'CABA', region: 'CABA', postalCode: '1043', country: 'AR', phone: '1155555555' } }) {
  server.use(
    http.get('/api/me', () => (profile ? HttpResponse.json(profile) : unauthenticated())),
    http.post('/api/checkout/quote', async ({ request }) => {
      const body = (await request.json()) as { shippingMethod: string; discountCode?: string };
      if (body.discountCode === 'WELCOME20') {
        return HttpResponse.json(quote({ discount: { code: 'WELCOME20', amountCents: 9_000 }, totals: { subtotalCents: 45_000, discountCents: 9_000, shippingCents: 0, totalCents: 36_000, currency: 'USD' } }));
      }
      if (body.discountCode) return HttpResponse.json(quote({ discountError: 'El código no existe' }));
      if (body.shippingMethod === 'express') return HttpResponse.json(quote({ totals: { subtotalCents: 45_000, discountCents: 0, shippingCents: 2_500, totalCents: 47_500, currency: 'USD' } }));
      return HttpResponse.json(quote());
    }),
  );
  return renderWithProviders(<CheckoutPage />, {
    route: '/checkout',
    path: '/checkout',
    extraRoutes: [{ path: '/pedidos/:number', element: <h1>Confirmación</h1> }],
  });
}

async function fillCard(number = '4242 4242 4242 4242') {
  await userEvent.type(screen.getByLabelText(/número de tarjeta/i), number);
  await userEvent.type(screen.getByLabelText(/vencimiento/i), '12/30');
  await userEvent.type(screen.getByLabelText(/cvc/i), '123');
  await userEvent.type(screen.getByLabelText(/titular/i), 'Ana Pérez');
}

describe('CheckoutPage', () => {
  it('precarga email y dirección del perfil, cambia envío y aplica descuento recalculando el total', async () => {
    setup();
    expect(await screen.findByDisplayValue('ana@example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Av. Corrientes 1234')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /pagar us\$ 450,00/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /exprés/i }));
    expect(await screen.findByRole('button', { name: /pagar us\$ 475,00/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /estándar/i }));
    await userEvent.type(screen.getByLabelText(/código de descuento/i), 'NOPE');
    await userEvent.click(screen.getByRole('button', { name: /aplicar/i }));
    expect(await screen.findByText('El código no existe')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(/código de descuento/i));
    await userEvent.type(screen.getByLabelText(/código de descuento/i), 'WELCOME20');
    await userEvent.click(screen.getByRole('button', { name: /aplicar/i }));
    expect(await screen.findByRole('button', { name: /pagar us\$ 360,00/i })).toBeInTheDocument();
  });

  it('valida la tarjeta antes de enviar (mismo esquema que la API)', async () => {
    setup();
    await screen.findByRole('button', { name: /pagar us\$ 450,00/i });
    await fillCard('4242 4242 4242 4241');
    await userEvent.click(screen.getByRole('button', { name: /pagar/i }));
    expect(await screen.findByText(/número de tarjeta inválido/i)).toBeInTheDocument();
  });

  it('paga con una sola request aunque hagan doble clic, con Idempotency-Key, y navega a la confirmación', async () => {
    const keys: (string | null)[] = [];
    let body: Record<string, unknown> | undefined;
    const { queryClient } = setup();
    server.use(
      http.post('/api/checkout/orders', async ({ request }) => {
        keys.push(request.headers.get('idempotency-key'));
        body = (await request.json()) as Record<string, unknown>;
        await delay(100);
        return HttpResponse.json(order(), { status: 201 });
      }),
    );
    const pay = await screen.findByRole('button', { name: /pagar us\$ 450,00/i });
    await fillCard();
    await userEvent.dblClick(pay);
    expect(await screen.findByRole('heading', { name: 'Confirmación' })).toBeInTheDocument();
    expect(queryClient.getQueryData(['cart'])).toMatchObject({ itemCount: 0, lines: [] });
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toMatchObject({ email: 'ana@example.com', shippingMethod: 'standard', expectedTotalCents: 45_000, card: { expMonth: 12, expYear: 2030 } });
  });

  it('muestra el rechazo del pago y permite reintentar con otra tarjeta', async () => {
    setup();
    server.use(
      http.post('/api/checkout/orders', () => problem(402, 'PAYMENT_DECLINED', 'El pago fue rechazado. Probá con otra tarjeta.', { meta: { reason: 'insufficient_funds' } })),
    );
    await screen.findByRole('button', { name: /pagar us\$ 450,00/i });
    await fillCard('4000 0000 0000 9995');
    await userEvent.click(screen.getByRole('button', { name: /pagar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/fondos insuficientes/i);
    expect(screen.getByRole('button', { name: /pagar/i })).toBeEnabled();
  });

  it('con el carrito vacío invita a seguir comprando', async () => {
    setup(null);
    server.use(http.post('/api/checkout/quote', () => problem(422, 'EMPTY_CART', 'Tu carrito está vacío')));
    expect(await screen.findByText(/tu carrito está vacío/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ir a la tienda/i })).toHaveAttribute('href', '/collections/all');
  });
});
