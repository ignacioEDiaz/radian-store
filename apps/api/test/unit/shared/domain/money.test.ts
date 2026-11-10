import { describe, expect, it } from 'vitest';
import { Money } from '../../../../src/shared/domain/money.js';
import { DomainError } from '../../../../src/shared/domain/errors.js';

describe('Money', () => {
  it('solo acepta centavos enteros no negativos', () => {
    expect(Money.cents(1050).cents).toBe(1050);
    expect(() => Money.cents(10.5)).toThrow(DomainError);
    expect(() => Money.cents(-1)).toThrow(DomainError);
  });

  it('suma, resta con piso en cero, multiplica y compara', () => {
    const a = Money.cents(1000);
    expect(a.add(Money.cents(250)).cents).toBe(1250);
    expect(a.subtractFloorZero(Money.cents(1500)).cents).toBe(0);
    expect(a.multiply(3).cents).toBe(3000);
    expect(a.gte(Money.cents(1000))).toBe(true);
  });

  it('calcula porcentajes redondeando hacia abajo', () => {
    expect(Money.cents(999).percentFloor(20).cents).toBe(199);
  });
});
