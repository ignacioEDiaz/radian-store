import type { CartLineView, CartView, CartWarning, ImageView } from '@radian/contracts';
import { MAX_LINE_QUANTITY, type CartLine } from '../domain/cart.js';

/** Información de presentación + disponibilidad vigente de una variante. */
export interface VariantInfo {
  variantId: string;
  productSlug: string;
  title: string;
  color: string;
  size: string;
  priceCents: number;
  published: boolean;
  available: number;
  image: ImageView | null;
}

/**
 * Arma la vista del carrito con precios y stock VIGENTES (función pura: la usan tanto los
 * comandos —con datos de escritura— como la consulta —con datos de lectura—).
 */
export function buildCartView(cartId: string | null, lines: CartLine[], info: Map<string, VariantInfo>): CartView {
  const views: CartLineView[] = lines.map((l) => {
    const v = info.get(l.variantId);
    const warnings: CartWarning[] = [];
    const sellable = !!v && v.published;
    const available = sellable && v.available > 0;
    if (!sellable) warnings.push('UNAVAILABLE');
    else if (!available) warnings.push('OUT_OF_STOCK');
    else if (v.available < l.quantity) warnings.push('QUANTITY_REDUCED');
    const price = v?.priceCents ?? l.unitPriceCents;
    if (available && price !== l.unitPriceCents) warnings.push('PRICE_CHANGED');
    const quantity = available ? Math.min(l.quantity, v.available) : l.quantity;
    return {
      lineId: l.id,
      variantId: l.variantId,
      productSlug: v?.productSlug ?? '',
      title: v?.title ?? 'Producto no disponible',
      color: v?.color ?? '',
      size: v?.size ?? '',
      image: v?.image ?? null,
      quantity,
      unitPriceCents: price,
      previousUnitPriceCents: price !== l.unitPriceCents ? l.unitPriceCents : null,
      lineTotalCents: available ? price * quantity : 0,
      available,
      maxQuantity: available ? Math.min(v.available, MAX_LINE_QUANTITY) : 0,
      warnings,
    };
  });
  const sellable = views.filter((l) => l.available);
  return {
    id: cartId,
    lines: views,
    itemCount: sellable.reduce((n, l) => n + l.quantity, 0),
    subtotalCents: sellable.reduce((n, l) => n + l.lineTotalCents, 0),
    currency: 'USD',
  };
}

export const emptyCart = (): CartView => ({ id: null, lines: [], itemCount: 0, subtotalCents: 0, currency: 'USD' });
