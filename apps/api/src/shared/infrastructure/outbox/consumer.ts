import type { DomainEvent } from '../../domain/domain-event.js';
import type { TxClient } from '../db/pool.js';

export interface StoredEvent extends DomainEvent {
  /** Posición global en el outbox. */
  readonly position: string;
}

export interface ConsumerResult {
  /** Tags de caché a invalidar tras aplicar. */
  invalidate?: string[];
}

/**
 * Consumidor de eventos del outbox.
 * - `target: 'read'`  → proyección: actualiza el modelo de lectura.
 * - `target: 'write'` → política: reacciona modificando la base de escritura (puede emitir eventos).
 * Se ejecuta dentro de una transacción de su base destino que también registra el checkpoint.
 */
export interface EventConsumer {
  readonly name: string;
  readonly target: 'read' | 'write';
  readonly handles: readonly string[];
  apply(event: StoredEvent, tx: TxClient): Promise<ConsumerResult | void>;
}
