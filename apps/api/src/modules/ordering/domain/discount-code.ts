import { DomainError } from '../../../shared/domain/errors.js';

export interface DiscountSnapshot {
  id: string;
  code: string;
  kind: 'percent' | 'fixed';
  value: number;
  startsAt: Date | null;
  endsAt: Date | null;
  minSubtotalCents: number | null;
  oncePerEmail: boolean;
  active: boolean;
}

const MESSAGES = {
  INACTIVE: 'Este código no está activo',
  NOT_STARTED: 'Este código todavía no está vigente',
  EXPIRED: 'Este código venció',
  MIN_SUBTOTAL: 'Tu compra no alcanza el mínimo para este código',
  ALREADY_USED: 'Ya usaste este código',
} as const;

export class DiscountCode {
  private constructor(private readonly s: DiscountSnapshot) {}

  static rehydrate(s: DiscountSnapshot) {
    return new DiscountCode(s);
  }

  get id() {
    return this.s.id;
  }
  get code() {
    return this.s.code;
  }
  get oncePerEmail() {
    return this.s.oncePerEmail;
  }

  /** Monto a descontar (centavos, redondeado hacia abajo) o error con el motivo. */
  amountFor(input: { subtotalCents: number; now: Date; alreadyUsedByEmail: boolean }): number {
    const fail = (reason: keyof typeof MESSAGES) => {
      throw new DomainError('INVALID_DISCOUNT', MESSAGES[reason], { reason });
    };
    if (!this.s.active) fail('INACTIVE');
    if (this.s.startsAt && input.now < this.s.startsAt) fail('NOT_STARTED');
    if (this.s.endsAt && input.now > this.s.endsAt) fail('EXPIRED');
    if (this.s.minSubtotalCents !== null && input.subtotalCents < this.s.minSubtotalCents) fail('MIN_SUBTOTAL');
    if (this.s.oncePerEmail && input.alreadyUsedByEmail) fail('ALREADY_USED');
    const amount = this.s.kind === 'percent' ? Math.floor((input.subtotalCents * this.s.value) / 100) : this.s.value;
    return Math.min(amount, input.subtotalCents);
  }

  toSnapshot(): DiscountSnapshot {
    return { ...this.s };
  }
}
