import { DomainError } from '../../../shared/domain/errors.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class Email {
  private constructor(readonly value: string) {}

  static create(raw: string): Email {
    const value = raw.trim().toLowerCase();
    if (value.length > 254 || !EMAIL.test(value)) throw new DomainError('INVALID_EMAIL', 'Email inválido');
    return new Email(value);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
