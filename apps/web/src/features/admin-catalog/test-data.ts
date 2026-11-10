import type { AdminProduct } from '@radian/contracts';

export const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';

export function adminProduct(overrides: Partial<AdminProduct> = {}): AdminProduct {
  return {
    id: PRODUCT_ID,
    slug: 'sharp-leather-boot',
    title: 'Sharp Leather Boot',
    description: 'Boot',
    productType: 'Footwear',
    materials: ['Leather'],
    tags: [],
    priceCents: 45000,
    compareAtCents: null,
    status: 'draft',
    featuredRank: null,
    variants: [],
    images: [],
    publishedAt: null,
    version: 1,
    updatedAt: '2026-11-10T12:00:00.000Z',
    ...overrides,
  };
}

export const variant = (id: string, sku: string, onHand = 3) => ({ id, sku, color: 'Black', size: 'S', priceCents: null, onHand, reserved: 0, available: onHand });

export const image = (id: string, alt = 'Frente') => ({
  id,
  mediaId: id,
  url: `/media/${id}/640.webp`,
  alt,
  color: null,
  position: 0,
  width: 800,
  height: 1000,
  widths: [320, 640],
});
