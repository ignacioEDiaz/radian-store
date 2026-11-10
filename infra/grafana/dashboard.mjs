// Genera dashboards/radian-store.json (dashboard como código).
// Uso: node infra/grafana/dashboard.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ds = { type: 'prometheus', uid: 'prometheus' };
let id = 0;
let y = 0;

function row(title) {
  const panel = { id: ++id, type: 'row', title, collapsed: false, gridPos: { h: 1, w: 24, x: 0, y }, panels: [] };
  y += 1;
  return panel;
}

function ts(title, targets, { unit = 'short', w = 8, h = 8, x = 0, stack = false, thresholds } = {}) {
  return {
    id: ++id,
    type: 'timeseries',
    title,
    datasource: ds,
    gridPos: { h, w, x, y },
    fieldConfig: {
      defaults: {
        unit,
        custom: { lineWidth: 2, fillOpacity: stack ? 30 : 10, stacking: { mode: stack ? 'normal' : 'none' } },
        ...(thresholds ? { thresholds: { mode: 'absolute', steps: thresholds } } : {}),
      },
      overrides: [],
    },
    options: { legend: { displayMode: 'list', placement: 'bottom' }, tooltip: { mode: 'multi' } },
    targets: targets.map(([expr, legendFormat], i) => ({ refId: String.fromCharCode(65 + i), datasource: ds, expr, legendFormat })),
  };
}

function stat(title, expr, { unit = 'short', w = 4, x = 0, thresholds, decimals } = {}) {
  return {
    id: ++id,
    type: 'stat',
    title,
    datasource: ds,
    gridPos: { h: 4, w, x, y },
    fieldConfig: {
      defaults: {
        unit,
        ...(decimals !== undefined ? { decimals } : {}),
        thresholds: { mode: 'absolute', steps: thresholds ?? [{ color: 'green', value: null }] },
      },
      overrides: [],
    },
    options: { colorMode: 'background', graphMode: 'area', reduceOptions: { calcs: ['lastNotNull'] } },
    targets: [{ refId: 'A', datasource: ds, expr }],
  };
}

/** Coloca una fila de paneles con anchos que suman 24. */
function line(...panels) {
  let x = 0;
  for (const p of panels) {
    p.gridPos.x = x;
    p.gridPos.y = y;
    x += p.gridPos.w;
  }
  y += Math.max(...panels.map((p) => p.gridPos.h));
  return panels;
}

const red = [{ color: 'green', value: null }, { color: 'orange', value: 0.01 }, { color: 'red', value: 0.05 }];
const panels = [
  row('Resumen'),
  ...line(
    stat('Pedidos/s', 'sum(rate(http_requests_total[1m]))', { unit: 'reqps', decimals: 2 }),
    stat('Errores 5xx', '(sum(rate(http_requests_total{status=~"5.."}[5m])) or vector(0)) / clamp_min(sum(rate(http_requests_total[5m])), 1e-9)', { unit: 'percentunit', thresholds: red }),
    stat('Latencia p95', 'histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))', { unit: 's', decimals: 3 }),
    stat('Cache hit ratio', 'sum(rate(cache_requests_total{result="hit"}[5m])) / clamp_min(sum(rate(cache_requests_total[5m])), 1e-9)', {
      unit: 'percentunit',
      thresholds: [{ color: 'red', value: null }, { color: 'orange', value: 0.5 }, { color: 'green', value: 0.8 }],
    }),
    stat('Atraso proyección', 'max(projection_lag_seconds)', { unit: 's', thresholds: [{ color: 'green', value: null }, { color: 'orange', value: 1 }, { color: 'red', value: 5 }] }),
    stat('Outbox pendientes', 'sum(outbox_pending)', { thresholds: [{ color: 'green', value: null }, { color: 'orange', value: 50 }, { color: 'red', value: 500 }] }),
  ),
  row('HTTP (RED)'),
  ...line(
    ts('Pedidos por ruta', [['sum by (route) (rate(http_requests_total[1m]))', '{{route}}']], { unit: 'reqps', w: 12, h: 9 }),
    ts('Errores por estado', [['sum by (status) (rate(http_requests_total{status=~"4..|5.."}[1m]))', '{{status}}']], { unit: 'reqps', w: 12, h: 9 }),
  ),
  ...line(
    ts('Latencia p50 / p95 / p99', [
      ['histogram_quantile(0.5, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))', 'p50'],
      ['histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))', 'p95'],
      ['histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))', 'p99'],
    ], { unit: 's', w: 12 }),
    ts('Latencia p95 por ruta', [['histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))', '{{route}}']], { unit: 's', w: 12 }),
  ),
  row('Pools de conexiones'),
  ...line(
    ts('Saturación (en uso / máximo)', [['max by (pool) (db_pool_connections{state="in_use"}) / max by (pool) (db_pool_max)', '{{pool}}']], {
      unit: 'percentunit', w: 8,
      thresholds: [{ color: 'green', value: null }, { color: 'red', value: 0.8 }],
    }),
    ts('Conexiones por estado', [['max by (pool, state) (db_pool_connections)', '{{pool}} {{state}}']], { w: 8 }),
    ts('Pedidos esperando conexión', [['max by (pool) (db_pool_connections{state="waiting"})', '{{pool}}']], { w: 8 }),
  ),
  ...line(
    ts('Tiempo de adquisición p95', [['histogram_quantile(0.95, sum by (le, pool) (rate(db_pool_acquire_seconds_bucket[5m])))', '{{pool}}']], { unit: 's', w: 12 }),
    ts('Timeouts y errores del pool', [
      ['sum by (pool) (increase(db_pool_acquire_timeouts_total[5m]))', 'timeouts {{pool}}'],
      ['sum by (pool) (increase(db_pool_errors_total[5m]))', 'errores {{pool}}'],
    ], { w: 12 }),
  ),
  row('Caché'),
  ...line(
    ts('Hit ratio por consulta', [['sum by (name) (rate(cache_requests_total{result="hit"}[5m])) / clamp_min(sum by (name) (rate(cache_requests_total[5m])), 1e-9)', '{{name}}']], { unit: 'percentunit', w: 12 }),
    ts('Accesos por resultado', [['sum by (result) (rate(cache_requests_total[1m]))', '{{result}}']], { unit: 'reqps', w: 12, stack: true }),
  ),
  row('CQRS: outbox y proyecciones'),
  ...line(
    ts('Atraso de proyección', [['max(projection_lag_seconds)', 'lag']], { unit: 's', w: 8 }),
    ts('Outbox pendientes / fallidos', [['sum(outbox_pending)', 'pendientes'], ['sum(increase(outbox_failed_total[5m]))', 'fallidos (5m)']], { w: 8 }),
    ts('Eventos aplicados', [['sum by (type, result) (rate(projection_events_total[1m]))', '{{type}} {{result}}']], { unit: 'ops', w: 8 }),
  ),
  row('Negocio'),
  ...line(
    ts('Logins', [['sum by (result) (rate(auth_login_total[5m]))', '{{result}}']], { unit: 'ops', w: 6 }),
    ts('Operaciones de carrito', [['sum by (op) (rate(cart_operations_total[5m]))', '{{op}}']], { unit: 'ops', w: 6 }),
    ts('Pedidos', [['sum by (result) (increase(orders_placed_total[5m]))', '{{result}}']], { w: 6 }),
    ts('Pagos', [['sum by (result) (increase(payment_attempts_total[5m]))', '{{result}}']], { w: 6 }),
  ),
  ...line(
    ts('Subidas de imágenes', [['sum by (result) (increase(media_uploads_total[5m]))', '{{result}}']], { w: 12 }),
    ts('Procesamiento de imágenes p95', [['histogram_quantile(0.95, sum by (le) (rate(media_processing_seconds_bucket[5m])))', 'p95']], { unit: 's', w: 12 }),
  ),
  row('Proceso Node.js'),
  ...line(
    ts('Memoria', [['process_resident_memory_bytes', 'RSS'], ['nodejs_heap_size_used_bytes', 'heap usado']], { unit: 'bytes', w: 8 }),
    ts('Event loop lag p99', [['nodejs_eventloop_lag_p99_seconds', 'p99']], { unit: 's', w: 8 }),
    ts('CPU', [['rate(process_cpu_seconds_total[1m])', 'cpu']], { unit: 'percentunit', w: 8 }),
  ),
];

const dashboard = {
  uid: 'radian-store',
  title: 'Radian Store',
  tags: ['radian', 'cqrs'],
  timezone: 'browser',
  schemaVersion: 41,
  version: 1,
  refresh: '5s',
  time: { from: 'now-30m', to: 'now' },
  panels,
};

const out = fileURLToPath(new URL('./dashboards/radian-store.json', import.meta.url));
writeFileSync(out, JSON.stringify(dashboard, null, 2) + '\n');
console.log(`Dashboard con ${panels.length} paneles → ${out}`);
