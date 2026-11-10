import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { renderWithProviders } from '../test/render';
import { adminProfile, customerProfile, unauthenticated } from '../test/fixtures';
import { Header } from './Header';
import { CartDrawerProvider } from '../features/cart/components/CartDrawerContext';
import { beforeEach } from 'vitest';

beforeEach(() =>
  server.use(
    http.get('/api/cart', () =>
      HttpResponse.json({ id: null, lines: [], itemCount: 0, subtotalCents: 0, currency: 'USD' }),
    ),
  ),
);
const header = () =>
  renderWithProviders(
    <CartDrawerProvider>
      <Header />
    </CartDrawerProvider>,
  );

describe('Header (estado de sesión)', () => {
  it('visitante: enlace para ingresar', async () => {
    server.use(http.get('/api/me', unauthenticated));
    header();
    expect(await screen.findByRole('link', { name: /ingresar/i })).toHaveAttribute(
      'href',
      '/cuenta/ingresar',
    );
  });

  it('cliente: enlace a su cuenta y salir', async () => {
    server.use(
      http.get('/api/me', () => HttpResponse.json(customerProfile)),
      http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
    );
    header();
    expect(await screen.findByRole('link', { name: /ana/i })).toHaveAttribute('href', '/cuenta');
    expect(screen.queryByRole('link', { name: /admin/i })).not.toBeInTheDocument();
    server.use(http.get('/api/me', unauthenticated));
    await userEvent.click(screen.getByRole('button', { name: /salir/i }));
    expect(await screen.findByRole('link', { name: /ingresar/i })).toBeInTheDocument();
  });

  it('admin: ve el acceso al panel', async () => {
    server.use(http.get('/api/me', () => HttpResponse.json(adminProfile)));
    header();
    expect(await screen.findByRole('link', { name: /admin/i })).toHaveAttribute('href', '/admin');
  });
});
