import { z } from 'zod';
import { addressSchema, emailSchema, type Address } from './identity.js';
import type { CartLineView } from './cart.js';

export const SHIPPING_METHODS = ['standard', 'express'] as const;
/** Subtotal (con descuento) desde el cual el envío estándar es gratis. La regla la aplica el backend. */
export const FREE_SHIPPING_THRESHOLD_CENTS = 15_000;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

/** Algoritmo de Luhn: detecta números de tarjeta mal tipeados antes de llamar al proveedor. */
export function luhnValid(number: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i -= 1) {
    let d = Number(number[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return number.length >= 12 && sum % 10 === 0;
}

export const cardSchema = z.object({
  number: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^\d{12,19}$/, 'Número de tarjeta inválido').refine(luhnValid, 'Número de tarjeta inválido')),
  expMonth: z.coerce.number().int().min(1, 'Mes inválido').max(12, 'Mes inválido'),
  expYear: z.coerce.number().int().min(2000).max(2100),
  cvc: z.string().regex(/^\d{3,4}$/, 'CVC inválido'),
  holder: z.string().trim().min(2, 'Ingresá el nombre del titular').max(80),
});

export const checkoutQuoteRequestSchema = z.object({
  shippingMethod: z.enum(SHIPPING_METHODS).default('standard'),
  discountCode: z.string().trim().max(40).optional(),
  email: emailSchema.optional(),
});

export const placeOrderRequestSchema = z.object({
  email: emailSchema,
  shippingAddress: addressSchema,
  shippingMethod: z.enum(SHIPPING_METHODS),
  discountCode: z.string().trim().max(40).optional(),
  card: cardSchema,
  expectedTotalCents: z.number().int().nonnegative(),
});

export const shipOrderRequestSchema = z.object({ expectedVersion: z.number().int(), trackingCode: z.string().trim().min(3).max(60) });
export const cancelOrderRequestSchema = z.object({ expectedVersion: z.number().int(), reason: z.string().trim().min(3).max(200) });

export const ORDER_STATUSES = ['pending_payment', 'paid', 'shipped', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const adminOrdersQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export interface Totals {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  currency: 'USD';
}

export interface CheckoutQuote {
  lines: CartLineView[];
  shippingOptions: { method: ShippingMethod; label: string; priceCents: number }[];
  discount: { code: string; amountCents: number } | null;
  discountError: string | null;
  totals: Totals;
}

export interface OrderLineView {
  variantId: string;
  sku: string;
  title: string;
  color: string;
  size: string;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface OrderDetail {
  id: string;
  number: string;
  status: OrderStatus;
  email: string;
  lines: OrderLineView[];
  shippingAddress: Address;
  shippingMethod: ShippingMethod;
  discount: { code: string; amountCents: number } | null;
  totals: Totals;
  payment: { brand: string; last4: string; status: string } | null;
  trackingCode: string | null;
  cancelReason: string | null;
  history: { status: OrderStatus; at: string }[];
  placedAt: string;
  version: number;
}

export interface OrderSummary {
  id: string;
  number: string;
  status: OrderStatus;
  email: string;
  totalCents: number;
  itemCount: number;
  placedAt: string;
}

export type PlaceOrderRequest = z.input<typeof placeOrderRequestSchema>;
export type CheckoutQuoteRequest = z.input<typeof checkoutQuoteRequestSchema>;
