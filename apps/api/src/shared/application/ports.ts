export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  uuid(): string;
}

export const systemClock: Clock = { now: () => new Date() };

export const randomIds: IdGenerator = { uuid: () => globalThis.crypto.randomUUID() };
