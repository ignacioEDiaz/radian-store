import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { HealthReport } from '@radian/contracts';
import { server } from '../../test/server';
import { renderWithProviders } from '../../test/render';
import { StatusPage } from './StatusPage';

const report: HealthReport = {
  status: 'degraded',
  version: '1.0.0',
  uptimeSeconds: 42,
  checks: {
    writeDb: { status: 'up', latencyMs: 2 },
    readDb: { status: 'up', latencyMs: 3 },
    cache: { status: 'down', latencyMs: 250, detail: 'Connection refused' },
    projector: { status: 'up', latencyMs: 4, lagSeconds: 0.2, pending: 1 },
  },
  pools: {
    write: { total: 2, idle: 1, inUse: 1, waiting: 0, max: 10 },
    read: { total: 3, idle: 3, inUse: 0, waiting: 0, max: 20 },
  },
};

describe('StatusPage', () => {
  it('muestra el estado global y el de cada componente', async () => {
    server.use(http.get('/health/ready', () => HttpResponse.json(report)));
    renderWithProviders(<StatusPage />);
    expect(await screen.findByRole('heading', { name: /estado del sistema/i })).toBeInTheDocument();
    expect(await screen.findByText(/degradado/i)).toBeInTheDocument();
    const cacheRow = screen.getByRole('row', { name: /caché/i });
    expect(within(cacheRow).getByText(/caído/i)).toBeInTheDocument();
    expect(within(cacheRow).getByText('Connection refused')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /pool write/i })).toHaveTextContent('1 / 10');
  });

  it('con 503 muestra el reporte "caído" (no un error genérico)', async () => {
    server.use(http.get('/health/ready', () => HttpResponse.json({ ...report, status: 'down' }, { status: 503 })));
    renderWithProviders(<StatusPage />);
    expect(await screen.findByText(/^caído$/i, { selector: '[data-status]' })).toBeInTheDocument();
  });

  it('si la API no responde muestra error y permite reintentar', async () => {
    server.use(http.get('/health/ready', () => HttpResponse.error()));
    renderWithProviders(<StatusPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo/i);
    server.use(http.get('/health/ready', () => HttpResponse.json({ ...report, status: 'ok' })));
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByText(/operativo/i, { selector: '[data-status]' })).toBeInTheDocument();
  });
});
