import pg from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { PoolStats } from '@radian/contracts';
import { ServiceUnavailableError } from '../../domain/errors.js';
import type { Metrics } from '../observability/metrics.js';
import type { Logger } from '../observability/logger.js';

export type PoolName = 'write' | 'read';

export interface PoolOptions {
  name: PoolName;
  url: string;
  max: number;
  idleTimeoutMs: number;
  acquireTimeoutMs: number;
  statementTimeoutMs: number;
}

/** Ejecutor de SQL: un pool o un cliente dentro de una transacción. */
export interface SqlExecutor {
  query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>>;
}

export type TxClient = PoolClient;

export interface DbPool extends SqlExecutor {
  readonly name: PoolName;
  withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
  withTransaction<T>(fn: (client: TxClient) => Promise<T>): Promise<T>;
  stats(): PoolStats;
  end(): Promise<void>;
}

const TIMEOUT_PATTERNS = [/timeout exceeded when trying to connect/i, /connection timeout/i];

/**
 * Única forma de obtener conexiones a PostgreSQL (Constitución IV).
 * Mide tiempo de adquisición, traduce timeouts a 503 y configura límites por conexión.
 */
export function createPool(options: PoolOptions, metrics: Metrics, logger: Logger): DbPool {
  const pool = new pg.Pool({
    connectionString: options.url,
    max: options.max,
    idleTimeoutMillis: options.idleTimeoutMs,
    connectionTimeoutMillis: options.acquireTimeoutMs,
    statement_timeout: options.statementTimeoutMs,
    idle_in_transaction_session_timeout: options.statementTimeoutMs * 2,
    application_name: `radian-api-${options.name}`,
  });
  const label = { pool: options.name };
  metrics.poolMax.set(label, options.max);

  pool.on('error', (err) => {
    metrics.poolErrors.inc(label);
    logger.error({ event: 'pool.idle_client_error', pool: options.name, err }, 'Conexión inactiva del pool falló');
  });

  async function acquire(): Promise<PoolClient> {
    const end = metrics.poolAcquire.startTimer(label);
    try {
      const client = await pool.connect();
      end();
      return client;
    } catch (err) {
      end();
      if (err instanceof Error && TIMEOUT_PATTERNS.some((p) => p.test(err.message))) {
        metrics.poolAcquireTimeouts.inc(label);
        throw new ServiceUnavailableError(
          'DB_POOL_TIMEOUT',
          `No se obtuvo conexión a la base "${options.name}" en ${options.acquireTimeoutMs} ms`,
        );
      }
      throw err;
    }
  }

  async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await acquire();
    let broken: Error | undefined;
    try {
      return await fn(client);
    } catch (err) {
      // Un cliente cuya conexión se rompió no debe volver al pool.
      if (err instanceof Error && /terminat|ECONNRESET/i.test(err.message)) broken = err;
      throw err;
    } finally {
      client.release(broken);
    }
  }

  return {
    name: options.name,
    query: (text, params) => withClient((c) => c.query(text, params)),
    withClient,
    withTransaction: (fn) =>
      withClient(async (client) => {
        await client.query('BEGIN');
        try {
          const result = await fn(client);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw err;
        }
      }),
    stats: () => ({
      total: pool.totalCount,
      idle: pool.idleCount,
      inUse: pool.totalCount - pool.idleCount,
      waiting: pool.waitingCount,
      max: options.max,
    }),
    end: () => pool.end(),
  };
}
