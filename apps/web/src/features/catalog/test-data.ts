import type { ImageView, ProductCard, ProductDetail, ProductList } from '@radian/contracts';

export const img = (id: string, alt: string, color: string | null = null): ImageView => ({
  url: `/media/${id}/640.webp`,
  srcset: [
    { width: 320, url: `/media/${id}/320.webp` },
    { width: 640, url: `/media/${id}/640.webp` },
  ],
  alt,
  width: 800,
  height: 1000,
  color,
});

export function card(n: number, overrides: Partial<ProductCard> = {}): ProductCard {
  return {
    id: `p${n}`,
    slug: `product-${n}`,
    title: `Product ${n}`,
    productType: 'Tops',
    priceCents: 10_000 + n,
    compareAtCents: null,
    image: img(`m${n}`, `Product ${n} front`),
    hoverImage: null,
    colors: ['Obsidian Black'],
    available: true,
    isNew: false,
    ...overrides,
  };
}

export function list(items: ProductCard[], overrides: Partial<ProductList> = {}): ProductList {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 24,
    facets: {
      colors: [
        { value: 'Obsidian Black', count: 12 },
        { value: 'Oxblood Burgundy', count: 5 },
      ],
      sizes: [
        { value: 'S', count: 10 },
        { value: 'M', count: 9 },
      ],
      materials: [{ value: 'Leather', count: 3 }],
      types: [{ value: 'Tops', count: 8 }],
      price: { min: 5000, max: 50000 },
    },
    ...overrides,
  };
}

export function detail(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    ...card(1, { slug: 'sharp-leather-boot', title: 'Sharp Leather Boot', priceCents: 45_000, compareAtCents: 57_692, colors: ['Obsidian Black', 'Oxblood Burgundy'] }),
    description: 'A sculpted boot.',
    materials: ['Leather'],
    images: [img('a', 'Black front', 'Obsidian Black'), img('b', 'Oxblood front', 'Oxblood Burgundy'), img('c', 'Detail', null)],
    variants: [
      { id: 'v1', sku: 'SB-OB-S', color: 'Obsidian Black', size: 'S', priceCents: 45_000, available: true, availableQty: 3 },
      { id: 'v2', sku: 'SB-OB-M', color: 'Obsidian Black', size: 'M', priceCents: 45_000, available: true, availableQty: 2 },
      { id: 'v3', sku: 'SB-OX-S', color: 'Oxblood Burgundy', size: 'S', priceCents: 45_000, available: false, availableQty: 0 },
      { id: 'v4', sku: 'SB-OX-M', color: 'Oxblood Burgundy', size: 'M', priceCents: 45_000, available: true, availableQty: 5 },
    ],
    options: { colors: ['Obsidian Black', 'Oxblood Burgundy'], sizes: ['S', 'M'] },
    related: [card(7, { title: 'Leather Tee' })],
    ...overrides,
  };
}
