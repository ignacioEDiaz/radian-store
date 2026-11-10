import { z } from 'zod';
import type { ImageView } from './catalog.js';

export const MAX_LINE_QUANTITY = 10;
export const MAX_CART_LINES = 50;

export const addCartItemRequestSchema = z.object({
  variantId: z.uuid(),
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY).default(1),
});

export const updateCartLineRequestSchema = z.object({
  quantity: z.number().int().min(1, 'La cantidad mínima es 1').max(MAX_LINE_QUANTITY, `La cantidad máxima es ${MAX_LINE_QUANTITY}`),
});

export type CartWarning = 'PRICE_CHANGED' | 'OUT_OF_STOCK' | 'QUANTITY_REDUCED' | 'UNAVAILABLE';

export interface CartLineView {
  lineId: string;
  variantId: string;
  productSlug: string;
  title: string;
  color: string;
  size: string;
  image: ImageView | null;
  quantity: number;
  unitPriceCents: number;
  previousUnitPriceCents: number | null;
  lineTotalCents: number;
  available: boolean;
  maxQuantity: number;
  warnings: CartWarning[];
}

export interface CartView {
  id: string | null;
  lines: CartLineView[];
  itemCount: number;
  subtotalCents: number;
  currency: 'USD';
}

export type AddCartItemRequest = z.input<typeof addCartItemRequestSchema>;
