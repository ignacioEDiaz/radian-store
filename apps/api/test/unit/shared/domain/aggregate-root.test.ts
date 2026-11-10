import { describe, expect, it } from 'vitest';
import { AggregateRoot } from '../../../../src/shared/domain/aggregate-root.js';
import type { DomainEvent } from '../../../../src/shared/domain/domain-event.js';

type Renamed = DomainEvent<'test.Renamed', { name: string }>;

class Thing extends AggregateRoot<Renamed> {
  readonly aggregateType = 'Thing';
  name = 'a';
  constructor(id: string, version: number) {
    super(id, version);
  }
  rename(name: string, now: Date) {
    this.name = name;
    this.record('test.Renamed', { name }, now);
  }
}

describe('AggregateRoot', () => {
  it('registra eventos con versión creciente y metadatos del agregado', () => {
    const t = new Thing('11111111-1111-4111-8111-111111111111', 0);
    const now = new Date('2026-01-01T00:00:00Z');
    t.rename('b', now);
    t.rename('c', now);
    const events = t.pullEvents();
    expect(events.map((e) => e.aggregateVersion)).toEqual([1, 2]);
    expect(events[0]).toMatchObject({
      type: 'test.Renamed',
      aggregateType: 'Thing',
      aggregateId: '11111111-1111-4111-8111-111111111111',
      occurredAt: now,
      payload: { name: 'b' },
    });
    expect(events[0]!.eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(t.version).toBe(2);
  });

  it('pullEvents vacía la lista pendiente y conserva la versión persistida', () => {
    const t = new Thing('11111111-1111-4111-8111-111111111111', 5);
    t.rename('x', new Date());
    expect(t.persistedVersion).toBe(5);
    t.pullEvents();
    expect(t.pullEvents()).toEqual([]);
    expect(t.version).toBe(6);
  });
});
