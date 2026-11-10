import { DomainError } from './errors.js';

/** Importe en centavos enteros (USD). Inmutable. */
export class Money {
  private constructor(readonly cents: number) {}

  static cents(value: number): Money {
    if (!Number.isInteger(value) || value < 0) {
      throw new DomainError('INVALID_MONEY', `Importe inválido: ${value}`);
    }
    return new Money(value);
  }

  static zero(): Money {
    return new Money(0);
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  subtractFloorZero(other: Money): Money {
    return new Money(Math.max(0, this.cents - other.cents));
  }

  multiply(factor: number): Money {
    if (!Number.isInteger(factor) || factor < 0) {
      throw new DomainError('INVALID_MONEY', `Factor inválido: ${factor}`);
    }
    return new Money(this.cents * factor);
  }

  percentFloor(percent: number): Money {
    return new Money(Math.floor((this.cents * percent) / 100));
  }

  min(other: Money): Money {
    return this.cents <= other.cents ? this : other;
  }

  gte(other: Money): boolean {
    return this.cents >= other.cents;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }
}
