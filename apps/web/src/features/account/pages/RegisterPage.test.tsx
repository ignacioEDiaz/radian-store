import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import { renderWithProviders } from '../../../test/render';
import { customerProfile, problem } from '../../../test/fixtures';
import { RegisterPage } from './RegisterPage';

async function fill(name: string, email: string, password: string) {
  await userEvent.type(screen.getByLabelText(/nombre/i), name);
  await userEvent.type(screen.getByLabelText(/email/i), email);
  await userEvent.type(screen.getByLabelText(/contraseña/i), password);
  await userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
}

describe('RegisterPage', () => {
  it('crea la cuenta y redirige a Mi cuenta', async () => {
    server.use(http.post('/api/auth/register', () => HttpResponse.json(customerProfile, { status: 201 })));
    renderWithProviders(<RegisterPage />, {
      route: '/cuenta/registro',
      path: '/cuenta/registro',
      extraRoutes: [{ path: '/cuenta', element: <h1>Mi cuenta</h1> }],
    });
    await fill('Ana', 'ana@example.com', 'una-clave-larga');
    expect(await screen.findByRole('heading', { name: 'Mi cuenta' })).toBeInTheDocument();
  });

  it('valida la contraseña junto al campo (mismo esquema que el backend)', async () => {
    renderWithProviders(<RegisterPage />);
    await fill('Ana', 'ana@example.com', 'corta');
    expect(await screen.findByText(/al menos 10 caracteres/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('muestra "email en uso" en el campo email', async () => {
    server.use(http.post('/api/auth/register', () => problem(409, 'EMAIL_TAKEN', 'Ese email ya está registrado')));
    renderWithProviders(<RegisterPage />);
    await fill('Ana', 'ana@example.com', 'una-clave-larga');
    expect(await screen.findByText('Ese email ya está registrado')).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true');
  });
});
