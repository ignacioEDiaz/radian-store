import { describe, expect, it } from 'vitest';
import { FakePaymentGateway } from '../../../src/modules/ordering/infrastructure/fake-payment-gateway.js';

const card = (number: string) => ({ number, expMonth: 12, expYear: 2030, cvc: '123', holder: 'Ana' });
const now = () => new Date('2026-11-10T12:00:00Z');

describe('FakePaymentGateway', () => {
  const gw = new FakePaymentGateway({ timeoutMs: 50, now });

  it('aprueba la tarjeta de prueba y devuelve solo marca y últimos 4', async () => {
    const r = await gw.charge({ amountCents: 1000, card: card('4242424242424242'), reference: 'RS-1' });
    expect(r).toEqual({ status: 'approved', reference: expect.stringMatching(/^ch_/), brand: 'visa', last4: '4242' });
  });

  it('rechaza con motivo según la tarjeta de prueba', async () => {
    expect(await gw.charge({ amountCents: 1000, card: card('4000000000000002'), reference: 'x' })).toMatchObject({ status: 'declined', reason: 'card_declined' });
    expect(await gw.charge({ amountCents: 1000, card: card('4000000000009995'), reference: 'x' })).toMatchObject({ status: 'declined', reason: 'insufficient_funds' });
  });

  it('simula un timeout del proveedor', async () => {
    const t0 = Date.now();
    expect(await gw.charge({ amountCents: 1000, card: card('4000000000000119'), reference: 'x' })).toEqual({ status: 'timeout' });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(45);
  });

  it('rechaza tarjetas vencidas y reintegra', async () => {
    expect(await gw.charge({ amountCents: 1000, card: { ...card('4242424242424242'), expYear: 2025 }, reference: 'x' })).toMatchObject({ status: 'declined', reason: 'expired_card' });
    expect(await gw.refund({ reference: 'ch_1', amountCents: 1000 })).toEqual({ reference: expect.stringMatching(/^re_/) });
  });
});
