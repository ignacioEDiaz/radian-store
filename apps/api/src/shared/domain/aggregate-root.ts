import type { DomainEvent } from './domain-event.js';

/**
 * Raíz de agregado: guarda la versión persistida (para concurrencia optimista)
 * y acumula los eventos de dominio que produce cada cambio de estado.
 */
export abstract class AggregateRoot<E extends DomainEvent = DomainEvent> {
  abstract readonly aggregateType: string;
  private pending: E[] = [];
  private currentVersion: number;

  protected constructor(
    readonly id: string,
    readonly persistedVersion: number,
  ) {
    this.currentVersion = persistedVersion;
  }

  get version(): number {
    return this.currentVersion;
  }

  protected record<T extends E['type']>(
    type: T,
    payload: Extract<E, { type: T }>['payload'],
    occurredAt: Date,
  ): void {
    this.currentVersion += 1;
    this.pending.push({
      eventId: globalThis.crypto.randomUUID(),
      type,
      aggregateType: this.aggregateType,
      aggregateId: this.id,
      aggregateVersion: this.currentVersion,
      occurredAt,
      payload,
    } as unknown as E);
  }

  pullEvents(): E[] {
    const events = this.pending;
    this.pending = [];
    return events;
  }

  get hasChanges(): boolean {
    return this.pending.length > 0;
  }
}
