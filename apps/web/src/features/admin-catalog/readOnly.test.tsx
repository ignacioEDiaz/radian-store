import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { renderWithProviders } from '../../test/render';
import { adminProfile, customerProfile, problem } from '../../test/fixtures';
import { createQueryClient } from '../../app/queryClient';
import { CartDrawerProvider } from '../cart/components/CartDrawerContext';
import { Header } from '../../app/Header';
import { LoginPage } from '../account/pages/LoginPage';
import { AdminLayout } from './pages/AdminLayout';
import { CollectionsPage } from './pages/CollectionsPage';
import { ReadOnlyDialog } from '../../shared/ui/ReadOnlyDialog';

const viewerProfile = { ...customerProfile, id: '33333333-3333-4333-8333-333333333333', email: 'demo@radian.store', name: 'Demo', role: 'viewer' as const };
const READ_ONLY = 'Esta es una cuenta de demostración de solo lectura: podés recorrer todo el panel de administración, pero no crear, editar ni borrar nada.';

afterEach(() => vi.unstubAllEnvs());

describe('Cuenta de solo lectura (viewer)', () => {
  it('ve el acceso Admin en el header', async () => {
    server.use(
      http.get('/api/me', () => HttpResponse.json(viewerProfile)),
      http.get('/api/cart', () => HttpResponse.json({ id: null, lines: [], itemCount: 0, subtotalCents: 0, currency: 'USD' })),
    );
    renderWithProviders(
      <CartDrawerProvider>
        <Header />
      </CartDrawerProvider>,
    );
    expect(await screen.findByRole('link', { name: /admin/i })).toHaveAttribute('href', '/admin');
  });

  it('entra al panel y ve un aviso permanente de modo solo lectura', async () => {
    server.use(http.get('/api/me', () => HttpResponse.json(viewerProfile)));
    renderWithProviders(<AdminLayout />, { route: '/admin', path: '/admin' });
    expect(await screen.findByRole('note')).toHaveTextContent(/modo solo lectura/i);
  });

  it('el admin no ve el aviso', async () => {
    server.use(http.get('/api/me', () => HttpResponse.json(adminProfile)));
    renderWithProviders(<AdminLayout />, { route: '/admin', path: '/admin' });
    expect(await screen.findByRole('navigation', { name: /administración/i })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('al intentar modificar, aparece un diálogo que explica por qué no puede', async () => {
    server.use(
      http.get('/api/me', () => HttpResponse.json(viewerProfile)),
      http.get('/api/admin/collections', () => HttpResponse.json([])),
      http.get('/api/admin/products', () => HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 50 })),
      http.post('/api/admin/collections', () => problem(403, 'READ_ONLY_ACCOUNT', READ_ONLY)),
    );
    renderWithProviders(
      <>
        <CollectionsPage />
        <ReadOnlyDialog />
      </>,
      { queryClient: createQueryClient() },
    );
    await userEvent.type(screen.getByLabelText(/título de la colección/i), 'Nueva');
    await userEvent.click(screen.getByRole('button', { name: /crear colección/i }));
    const dialog = await screen.findByRole('alertdialog', { name: /cuenta de solo lectura/i });
    expect(dialog).toHaveTextContent(/no crear, editar ni borrar/i);
    await userEvent.click(within(dialog).getByRole('button', { name: /entendido/i }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('el login muestra las credenciales de la cuenta demo cuando están configuradas', async () => {
    vi.stubEnv('VITE_DEMO_VIEWER', 'demo@radian.store:demo-password-123');
    renderWithProviders(<LoginPage />);
    const hint = screen.getByRole('note');
    expect(hint).toHaveTextContent('demo@radian.store');
    expect(hint).toHaveTextContent('demo-password-123');
    await userEvent.click(within(hint).getByRole('button', { name: /usar cuenta demo/i }));
    expect(screen.getByLabelText(/email/i)).toHaveValue('demo@radian.store');
  });
});
