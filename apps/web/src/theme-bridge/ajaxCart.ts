import type { CartLineView, CartView } from '@radian/contracts';

/**
 * Forma del carrito que espera el JavaScript del tema (API Ajax de carrito de Shopify).
 * Solo se completan los campos que el tema lee; los importes van en centavos.
 */
export interface AjaxCartItem {
  id: string;
  key: string;
  variant_id: string;
  product_id: string;
  quantity: number;
  title: string;
  product_title: string;
  variant_title: string;
  handle: string;
  url: string;
  sku: string;
  price: number;
  original_price: number;
  final_price: number;
  line_price: number;
  final_line_price: number;
  original_line_price: number;
  total_discount: number;
  discounts: never[];
  properties: Record<string, never>;
  image: string | null;
  featured_image: { url: string; alt: string; width: number; height: number; aspect_ratio: number } | null;
  options_with_values: { name: string; value: string }[];
  variant_options: string[];
  requires_shipping: boolean;
  gift_card: boolean;
}

export interface AjaxCart {
  token: string;
  note: string;
  attributes: Record<string, never>;
  original_total_price: number;
  total_price: number;
  total_discount: number;
  total_weight: number;
  item_count: number;
  items: AjaxCartItem[];
  requires_shipping: boolean;
  currency: 'USD';
  items_subtotal_price: number;
  cart_level_discount_applications: never[];
  checkout_charge_amount: number;
  sections?: Record<string, string>;
}

export function toAjaxItem(line: CartLineView): AjaxCartItem {
  const image = line.image;
  return {
    id: line.variantId,
    key: line.lineId,
    variant_id: line.variantId,
    product_id: line.productSlug,
    quantity: line.quantity,
    title: `${line.title} - ${line.color} / ${line.size}`,
    product_title: line.title,
    variant_title: `${line.color} / ${line.size}`,
    handle: line.productSlug,
    url: `/products/${line.productSlug}`,
    sku: '',
    price: line.unitPriceCents,
    original_price: line.unitPriceCents,
    final_price: line.unitPriceCents,
    line_price: line.lineTotalCents,
    final_line_price: line.lineTotalCents,
    original_line_price: line.lineTotalCents,
    total_discount: 0,
    discounts: [],
    properties: {},
    image: image?.url ?? null,
    featured_image: image
      ? { url: image.url, alt: image.alt, width: image.width, height: image.height, aspect_ratio: image.height ? image.width / image.height : 1 }
      : null,
    options_with_values: [
      { name: 'Color', value: line.color },
      { name: 'Talle', value: line.size },
    ],
    variant_options: [line.color, line.size],
    requires_shipping: true,
    gift_card: false,
  };
}

export function toAjaxCart(cart: CartView): AjaxCart {
  return {
    token: cart.id ?? '',
    note: '',
    attributes: {},
    original_total_price: cart.subtotalCents,
    total_price: cart.subtotalCents,
    total_discount: 0,
    total_weight: 0,
    item_count: cart.itemCount,
    items: cart.lines.map(toAjaxItem),
    requires_shipping: cart.lines.length > 0,
    currency: 'USD',
    items_subtotal_price: cart.subtotalCents,
    cart_level_discount_applications: [],
    checkout_charge_amount: cart.subtotalCents,
  };
}
