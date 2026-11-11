import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Todas las métricas del proceso en un Registry propio (no el global),
 * para que cada test y cada instancia de la app tengan contadores aislados.
 */
export class Metrics {
  readonly registry = new Registry();

  readonly httpRequests = new Counter({
    name: 'http_requests_total',
    help: 'Pedidos HTTP atendidos',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });
  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Latencia de pedidos HTTP',
    labelNames: ['method', 'route'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  readonly poolConnections = new Gauge({
    name: 'db_pool_connections',
    help: 'Conexiones del pool por estado',
    labelNames: ['pool', 'state'] as const,
    registers: [this.registry],
  });
  readonly poolMax = new Gauge({
    name: 'db_pool_max',
    help: 'Tamaño máximo configurado del pool',
    labelNames: ['pool'] as const,
    registers: [this.registry],
  });
  readonly poolAcquire = new Histogram({
    name: 'db_pool_acquire_seconds',
    help: 'Tiempo para obtener una conexión del pool',
    labelNames: ['pool'] as const,
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });
  readonly poolAcquireTimeouts = new Counter({
    name: 'db_pool_acquire_timeouts_total',
    help: 'Operaciones que no obtuvieron conexión a tiempo',
    labelNames: ['pool'] as const,
    registers: [this.registry],
  });
  readonly poolErrors = new Counter({
    name: 'db_pool_errors_total',
    help: 'Conexiones del pool cortadas por error (inactivas o en uso)',
    labelNames: ['pool'] as const,
    registers: [this.registry],
  });

  readonly cacheRequests = new Counter({
    name: 'cache_requests_total',
    help: 'Accesos a la caché por resultado',
    labelNames: ['name', 'result'] as const,
    registers: [this.registry],
  });

  readonly outboxPending = new Gauge({
    name: 'outbox_pending',
    help: 'Eventos del outbox pendientes de proyectar',
    registers: [this.registry],
  });
  readonly outboxFailed = new Counter({
    name: 'outbox_failed_total',
    help: 'Eventos que agotaron los reintentos',
    registers: [this.registry],
  });
  readonly projectionLag = new Gauge({
    name: 'projection_lag_seconds',
    help: 'Antigüedad del evento pendiente más viejo',
    registers: [this.registry],
  });
  readonly projectionEvents = new Counter({
    name: 'projection_events_total',
    help: 'Eventos aplicados por los consumidores',
    labelNames: ['type', 'result'] as const,
    registers: [this.registry],
  });

  // --- Negocio ---
  readonly authLogins = new Counter({
    name: 'auth_login_total',
    help: 'Intentos de login por resultado',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  readonly ordersPlaced = new Counter({
    name: 'orders_placed_total',
    help: 'Intentos de compra por resultado',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });
  readonly paymentAttempts = new Counter({
    name: 'payment_attempts_total',
    help: 'Cobros por resultado del proveedor',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });
  readonly cartOperations = new Counter({
    name: 'cart_operations_total',
    help: 'Operaciones de carrito por resultado',
    labelNames: ['op', 'result'] as const,
    registers: [this.registry],
  });
  readonly mediaUploads = new Counter({
    name: 'media_uploads_total',
    help: 'Subidas de imágenes por resultado',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });
  readonly mediaProcessing = new Histogram({
    name: 'media_processing_seconds',
    help: 'Tiempo de validación y generación de tamaños',
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  constructor(options: { defaultMetrics?: boolean } = {}) {
    if (options.defaultMetrics) collectDefaultMetrics({ register: this.registry });
  }
}
