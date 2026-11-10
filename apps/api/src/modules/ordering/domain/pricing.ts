export type ShippingMethod = 'standard' | 'express';

export const SHIPPING = { standard: 1_000, express: 2_500 } as const;
export const FREE_SHIPPING_THRESHOLD = 15_000;

export interface Totals {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  currency: 'USD';
}

/**
 * Reglas de precio del checkout (servicio de dominio, sin estado):
 * envío estándar gratis si el subtotal CON descuento llega al umbral; exprés siempre se cobra.
 */
export function calculateTotals(input: { subtotalCents: number; discountCents: number; shippingMethod: ShippingMethod }): Totals {
  const discountCents = Math.min(input.discountCents, input.subtotalCents);
  const afterDiscount = input.subtotalCents - discountCents;
  const shippingCents = input.shippingMethod === 'express' ? SHIPPING.express : afterDiscount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING.standard;
  return { subtotalCents: input.subtotalCents, discountCents, shippingCents, totalCents: afterDiscount + shippingCents, currency: 'USD' };
}

export const SHIPPING_LABELS: Record<ShippingMethod, string> = {
  standard: 'Estándar (3 a 7 días hábiles)',
  express: 'Exprés (1 a 2 días hábiles)',
};
