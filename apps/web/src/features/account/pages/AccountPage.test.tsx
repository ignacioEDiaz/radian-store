import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import { renderWithProviders } from '../../../test/render';
import { customerProfile } from '../../../test/fixtures';
import { AccountPage } from './AccountPage';

describe('AccountPage', () => {
  it('muestra los datos y guarda nombre y dirección', async () => {
    let patch: Record<string, unknown> | undefined;
    server.use(
      http.get('/api/me', () => HttpResponse.json(customerProfile)),
      http.patch('/api/me', async ({ request }) => {
        patch = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...customerProfile, ...patch });
      }),
    );
    renderWithProviders(<AccountPage />);
    expect(await screen.findByText('ana@example.com')).toBeInTheDocument();

    const name = screen.getByLabelText(/^nombre$/i);
    await userEvent.clear(name);
    await userEvent.type(name, 'Ana María');
    await userEvent.type(screen.getByLabelText(/destinatario/i), 'Ana María');
    await userEvent.type(screen.getByLabelText(/dirección/i), 'Calle 123');
    await userEvent.type(screen.getByLabelText(/ciudad/i), 'Rosario');
    await userEvent.type(screen.getByLabelText(/provincia/i), 'Santa Fe');
    await userEvent.type(screen.getByLabelText(/código postal/i), '2000');
    await userEvent.type(screen.getByLabelText(/país/i), 'AR');
    await userEvent.type(screen.getByLabelText(/teléfono/i), '3415555555');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/guardado/i);
    expect(patch).toMatchObject({ name: 'Ana María', defaultAddress: { city: 'Rosario', country: 'AR' } });
  });

  it('marca los campos de dirección faltantes sin llamar a la API', async () => {
    let called = false;
    server.use(
      http.get('/api/me', () => HttpResponse.json(customerProfile)),
      http.patch('/api/me', () => {
        called = true;
        return HttpResponse.json(customerProfile);
      }),
    );
    renderWithProviders(<AccountPage />);
    await userEvent.type(await screen.findByLabelText(/destinatario/i), 'Ana');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findAllByText(/obligatori|al menos/i)).not.toHaveLength(0);
    expect(screen.getByLabelText(/ciudad/i)).toHaveAttribute('aria-invalid', 'true');
    expect(called).toBe(false);
  });
});
