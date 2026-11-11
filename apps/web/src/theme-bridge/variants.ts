import type { ProductDetail, VariantView } from '@radian/contracts';
import shopifyVariants from './shopify-variants.json';

/** Variante tal como la referencia el markup del tema: producto + (opcional) color y talle. */
export interface VariantRef {
  handle: string;
  color: string | null;
  size: string | null;
}

const MAP = shopifyVariants as unknown as Record<string, [string, string | null, string | null]>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isVariantUuid = (id: string) => UUID.test(id);

/** "gid://shopify/ProductVariant/123" | "123" → "123" */
export const rawId = (id: unknown) => String(id ?? '').split('/').pop() ?? '';

export function lookupShopifyVariant(id: string): VariantRef | null {
  const hit = MAP[rawId(id)];
  return hit ? { handle: hit[0], color: hit[1], size: hit[2] } : null;
}

const same = (a: string, b: string | null) => b !== null && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Elige la variante real del catálogo para una referencia del tema. Si el tema no indica talle
 * (p. ej. un swatch de color) se toma el primero con stock; si el color no existe en nuestro
 * catálogo, el primero disponible del producto.
 */
export function pickVariant(product: Pick<ProductDetail, 'variants'>, ref: Pick<VariantRef, 'color' | 'size'>): VariantView | null {
  const byColor = product.variants.filter((v) => same(v.color, ref.color));
  const pool = byColor.length > 0 ? byColor : product.variants;
  const exact = ref.size ? pool.find((v) => same(v.size, ref.size)) : undefined;
  if (exact) return exact;
  if (ref.size && byColor.length > 0) return null;
  return pool.find((v) => v.available) ?? pool[0] ?? null;
}
