import { randomUUID } from 'node:crypto';
import type { Card, ChargeResult, PaymentGateway } from '../application/ports.js';

/** Tarjetas de prueba documentadas en el quickstart. */
const TEST_CARDS: Record<string, ChargeResult | 'timeout'> = {
  '4000000000000002': { status: 'declined', reason: 'card_declined' },
  '4000000000009995': { status: 'declined', reason: 'insufficient_funds' },
  '4000000000000119': 'timeout',
};

function brandOf(number: string): string {
  if (number.startsWith('4')) return 'visa';
  if (/^5[1-5]/.test(number)) return 'mastercard';
  if (/^3[47]/.test(number)) return 'amex';
  return 'card';
}

/**
 * Pasarela simulada: decide por número de tarjeta. Nunca guarda el número ni el CVC;
 * solo devuelve marca y últimos 4, como haría un proveedor real con tokenización.
 */
export class FakePaymentGateway implements PaymentGateway {
  constructor(private readonly o: { timeoutMs: number; now?: () => Date }) {}

  async charge(input: { amountCents: number; card: Card; reference: string }): Promise<ChargeResult> {
    const number = input.card.number.replace(/\D/g, '');
    const now = (this.o.now ?? (() => new Date()))();
    const expiry = new Date(Date.UTC(input.card.expYear, input.card.expMonth, 1)); // primer día del mes siguiente
    if (expiry <= now) return { status: 'declined', reason: 'expired_card' };
    const outcome = TEST_CARDS[number];
    if (outcome === 'timeout') {
      await new Promise((r) => setTimeout(r, this.o.timeoutMs));
      return { status: 'timeout' };
    }
    if (outcome) return outcome;
    return { status: 'approved', reference: `ch_${randomUUID().slice(0, 18)}`, brand: brandOf(number), last4: number.slice(-4) };
  }

  async refund(_input: { reference: string; amountCents: number }) {
    return { reference: `re_${randomUUID().slice(0, 18)}` };
  }
}
