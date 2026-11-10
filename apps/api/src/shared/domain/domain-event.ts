export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly eventId: string;
  readonly type: TType;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}

export type AnyDomainEvent = DomainEvent<string, unknown>;
