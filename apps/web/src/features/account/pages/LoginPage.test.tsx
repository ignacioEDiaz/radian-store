import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import { renderWithProviders } from '../../../test/render';
import { customerProfile, problem } from '../../../test/fixtures';
import { queryKeys } from '../../../shared/api/queryKeys';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('inicia sesión, guarda la sesión en caché y navega a Mi cuenta', async () => {
    let body: unknown;
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(customerProfile);
      }),
    );
    const { queryClient } = renderWithProviders(<LoginPage />, {
      route: '/cuenta/ingresar',
      path: '/cuenta/ingresar',
      extraRoutes: [{ path: '/cuenta', element: <h1>Mi cuenta</h1> }],
    });
    await userEvent.type(screen.getByLabelText(/email/i), 'ana@example.com');
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'una-clave-larga');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    expect(await screen.findByRole('heading', { name: 'Mi cuenta' })).toBeInTheDocument();
    expect(body).toEqual({ email: 'ana@example.com', password: 'una-clave-larga' });
    expect(queryClient.getQueryData(queryKeys.session)).toEqual(customerProfile);
  });

  it('vuelve a la página que pidió el login (?redirect=)', async () => {
    server.use(http.post('/api/auth/login', () => HttpResponse.json(customerProfile)));
    renderWithProviders(<LoginPage />, {
      route: '/cuenta/ingresar?redirect=/checkout',
      path: '/cuenta/ingresar',
      extraRoutes: [{ path: '/checkout', element: <h1>Checkout</h1> }],
    });
    await userEvent.type(screen.getByLabelText(/email/i), 'ana@example.com');
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    expect(await screen.findByRole('heading', { name: 'Checkout' })).toBeInTheDocument();
  });

  it('muestra el error genérico y el bloqueo por intentos', async () => {
    server.use(http.post('/api/auth/login', () => problem(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos')));
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/email/i), 'ana@example.com');
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'mala');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos');

    server.use(http.post('/api/auth/login', () => problem(429, 'TOO_MANY_ATTEMPTS', 'Demasiados intentos fallidos. Probá de nuevo más tarde.')));
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/demasiados intentos/i);
  });

  it('valida el email antes de enviar', async () => {
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/email/i), 'no-es-email');
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));
    expect(await screen.findByText(/email inválido/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true');
  });
});
