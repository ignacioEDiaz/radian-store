import type { DomainEvent } from '../../../shared/domain/domain-event.js';

export type ProductStatus = 'draft' | 'published' | 'archived';

export interface VariantSnapshot {
  id: string;
  sku: string;
  color: string;
  size: string;
  priceCents: number | null;
  position: number;
}

export interface ImageSnapshot {
  id: string;
  mediaId: string;
  alt: string;
  color: string | null;
  position: number;
  width: number;
  height: number;
  widths: number[];
}

export interface ProductSnapshot {
  id: string;
  slug: string;
  title: string;
  description: string;
  productType: string;
  materials: string[];
  tags: string[];
  priceCents: number;
  compareAtCents: number | null;
  status: ProductStatus;
  featuredRank: number | null;
  variants: VariantSnapshot[];
  images: ImageSnapshot[];
  publishedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

type P<T extends string, X = object> = DomainEvent<T, { snapshot: ProductSnapshot } & X>;

export type ProductEvent =
  | P<'catalog.ProductCreated'>
  | P<'catalog.ProductDetailsUpdated'>
  | P<'catalog.VariantAdded', { variantId: string }>
  | P<'catalog.VariantUpdated', { variantId: string }>
  | P<'catalog.VariantRemoved', { variantId: string }>
  | P<'catalog.ProductImageAttached', { imageId: string }>
  | P<'catalog.ProductImageUpdated', { imageId: string }>
  | P<'catalog.ProductImagesReordered'>
  | P<'catalog.ProductImageRemoved', { imageId: string }>
  | P<'catalog.ProductPublished'>
  | P<'catalog.ProductUnpublished'>
  | P<'catalog.ProductArchived'>
  | P<'catalog.ProductFeaturedRankChanged'>;

export const PRODUCT_EVENT_TYPES: ProductEvent['type'][] = [
  'catalog.ProductCreated',
  'catalog.ProductDetailsUpdated',
  'catalog.VariantAdded',
  'catalog.VariantUpdated',
  'catalog.VariantRemoved',
  'catalog.ProductImageAttached',
  'catalog.ProductImageUpdated',
  'catalog.ProductImagesReordered',
  'catalog.ProductImageRemoved',
  'catalog.ProductPublished',
  'catalog.ProductUnpublished',
  'catalog.ProductArchived',
  'catalog.ProductFeaturedRankChanged',
];

export interface CollectionImage {
  mediaId: string;
  width: number;
  height: number;
  widths: number[];
}

export interface CollectionSnapshot {
  id: string;
  slug: string;
  title: string;
  description: string;
  image: CollectionImage | null;
  productIds: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

type C<T extends string> = DomainEvent<T, { snapshot: CollectionSnapshot }>;
export type CollectionEvent = C<'catalog.CollectionCreated'> | C<'catalog.CollectionUpdated'> | C<'catalog.CollectionProductsSet'>;
export const COLLECTION_EVENT_TYPES: CollectionEvent['type'][] = ['catalog.CollectionCreated', 'catalog.CollectionUpdated', 'catalog.CollectionProductsSet'];
