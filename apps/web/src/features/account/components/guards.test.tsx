import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/server';
import { renderWithProviders } from '../../../test/render';
import { adminProfile, customerProfile, unauthenticated } from '../../../test/fixtures';
import { RequireAuth, RequireAdmin } from './guards';

describe('RequireAuth', () => {
  it('sin sesión redirige al login conservando el destino', async () => {
    server.use(http.get('/api/me', unauthenticated));
    renderWithProviders(
      <RequireAuth>
        <p>privado</p>
      </RequireAuth>,
      { route: '/cuenta', path: '/cuenta', extraRoutes: [{ path: '/cuenta/ingresar', element: <LoginProbe /> }] },
    );
    expect(await screen.findByText('login: /cuenta')).toBeInTheDocument();
  });

  it('con sesión muestra el contenido', async () => {
    server.use(http.get('/api/me', () => HttpResponse.json(customerProfile)));
    renderWithProviders(
      <RequireAuth>
        <p>privado</p>
      </RequireAuth>,
    );
    expect(await screen.findByText('privado')).toBeInTheDocument();
  });
});

describe('RequireAdmin', () => {
  it('un cliente ve "sin permiso"', async () => {
    server.use(http.get('/api/me', () => HttpResponse.json(customerProfile)));
    renderWithProviders(
      <RequireAdmin>
        <p>panel</p>
      </RequireAdmin>,
    );
    expect(await screen.findByRole('heading', { name: /sin permiso/i })).toBeInTheDocument();
    expect(screen.queryByText('panel')).not.toBeInTheDocument();
  });

  it('un admin ve el panel', async () => {
    server.use(http.get('/api/me', () => HttpResponse.json(adminProfile)));
    renderWithProviders(
      <RequireAdmin>
        <p>panel</p>
      </RequireAdmin>,
    );
    expect(await screen.findByText('panel')).toBeInTheDocument();
  });
});

import { useSearchParams } from 'react-router';
function LoginProbe() {
  const [params] = useSearchParams();
  return <p>login: {params.get('redirect')}</p>;
}
