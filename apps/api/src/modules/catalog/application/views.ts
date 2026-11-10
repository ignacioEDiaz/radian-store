import type { AdminCollection, AdminImage, AdminProduct } from '@radian/contracts';
import type { CollectionSnapshot, ImageSnapshot, ProductSnapshot } from '../domain/events.js';

export const mediaUrl = (mediaId: string, width: number) => `/media/${mediaId}/${width}.webp`;

/** Ancho por defecto para mostrar una imagen (960 si existe, si no el mayor disponible). */
export function defaultWidth(widths: number[]): number {
  return widths.includes(960) ? 960 : Math.max(...widths);
}

export function toAdminImage(i: ImageSnapshot): AdminImage {
  return { ...i, url: mediaUrl(i.mediaId, defaultWidth(i.widths)) };
}

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

export function toAdminProduct(s: ProductSnapshot, stock: Map<string, { onHand: number; reserved: number }>): AdminProduct {
  return {
    id: s.id,
    slug: s.slug,
    title: s.title,
    description: s.description,
    productType: s.productType,
    materials: s.materials,
    tags: s.tags,
    priceCents: s.priceCents,
    compareAtCents: s.compareAtCents,
    status: s.status,
    featuredRank: s.featuredRank,
    variants: s.variants.map((v) => {
      const level = stock.get(v.id) ?? { onHand: 0, reserved: 0 };
      return { id: v.id, sku: v.sku, color: v.color, size: v.size, priceCents: v.priceCents, ...level, available: level.onHand - level.reserved };
    }),
    images: [...s.images].sort((a, b) => a.position - b.position).map(toAdminImage),
    publishedAt: iso(s.publishedAt),
    version: s.version,
    updatedAt: iso(s.updatedAt)!,
  };
}

export function toAdminCollection(s: CollectionSnapshot): AdminCollection {
  return {
    id: s.id,
    slug: s.slug,
    title: s.title,
    description: s.description,
    imageMediaId: s.image?.mediaId ?? null,
    imageUrl: s.image ? mediaUrl(s.image.mediaId, defaultWidth(s.image.widths)) : null,
    productIds: s.productIds,
    version: s.version,
  };
}
