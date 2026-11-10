import { Redis } from 'ioredis';

/**
 * Cliente Redis que falla rápido: sin cola offline y con timeout por comando,
 * para que una caché caída no agregue latencia a los pedidos.
 */
export function createRedisClient(url: string): Redis {
  const client = new Redis(url, {
    lazyConnect: false,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: 250,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });
  client.on('error', () => {
    // Los errores se reportan por métricas/health; evitamos "Unhandled error event".
  });
  return client;
}

/** Espera la primera conexión sin fallar: si Redis no responde a tiempo, la app arranca degradada. */
export async function waitForReady(client: Redis, timeoutMs: number): Promise<boolean> {
  if (client.status === 'ready') return true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      client.off('ready', onReady);
      resolve(false);
    }, timeoutMs);
    const onReady = () => {
      clearTimeout(timer);
      resolve(true);
    };
    client.once('ready', onReady);
  });
}
