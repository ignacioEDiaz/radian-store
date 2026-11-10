import { z } from 'zod';

const cents = z.number().int().positive();
const strings = z.array(z.string().trim().min(1).max(40)).max(20);
const version = z.number().int().nonnegative();

export const productDetailsSchema = z.object({
  title: z.string().trim().min(2, 'El título debe tener al menos 2 caracteres').max(120),
  description: z.string().max(5000).default(''),
  productType: z.string().trim().min(2, 'Indicá el tipo de producto').max(40),
  materials: strings.default([]),
  tags: strings.default([]),
  priceCents: cents,
  compareAtCents: cents.nullable().default(null),
});

export const createProductRequestSchema = productDetailsSchema;
export const updateProductRequestSchema = productDetailsSchema.partial().extend({ expectedVersion: version });

export const addVariantRequestSchema = z.object({
  expectedVersion: version,
  sku: z.string().trim().min(3).max(40),
  color: z.string().trim().min(1).max(40),
  size: z.string().trim().min(1).max(10),
  priceCents: cents.nullable().default(null),
  initialStock: z.number().int().min(0).max(100_000).default(0),
});
export const updateVariantRequestSchema = addVariantRequestSchema.omit({ initialStock: true }).partial().extend({ expectedVersion: version });

export const attachImageRequestSchema = z.object({
  expectedVersion: version,
  mediaId: z.uuid(),
  alt: z.string().max(200).default(''),
  color: z.string().trim().max(40).nullable().default(null),
});
export const updateImageRequestSchema = z.object({
  expectedVersion: version,
  alt: z.string().max(200).optional(),
  color: z.string().trim().max(40).nullable().optional(),
});
export const reorderImagesRequestSchema = z.object({ expectedVersion: version, imageIds: z.array(z.uuid()).min(1) });
export const versionOnlyRequestSchema = z.object({ expectedVersion: version });
export const featuredRankRequestSchema = z.object({ expectedVersion: version, rank: z.number().int().min(1).nullable() });

export const stockAdjustmentRequestSchema = z.object({
  delta: z.number().int().refine((d) => d !== 0, 'El ajuste no puede ser 0'),
  reason: z.enum(['restock', 'correction', 'damage', 'other']),
  note: z.string().max(200).optional(),
});

export const adminProductsQuerySchema = z.object({
  status: z.enum(['draft', 'published', 'archived']).optional(),
  q: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const createCollectionRequestSchema = z.object({
  title: z.string().trim().min(2).max(80),
  description: z.string().max(1000).default(''),
  imageMediaId: z.uuid().nullable().default(null),
});
export const updateCollectionRequestSchema = createCollectionRequestSchema.partial().extend({ expectedVersion: version });
export const setCollectionProductsRequestSchema = z.object({ expectedVersion: version, productIds: z.array(z.uuid()).max(500) });

export interface AdminVariant {
  id: string;
  sku: string;
  color: string;
  size: string;
  priceCents: number | null;
  onHand: number;
  reserved: number;
  available: number;
}

export interface AdminImage {
  id: string;
  mediaId: string;
  url: string;
  alt: string;
  color: string | null;
  position: number;
  width: number;
  height: number;
  widths: number[];
}

export type ProductStatus = 'draft' | 'published' | 'archived';

export interface AdminProduct {
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
  variants: AdminVariant[];
  images: AdminImage[];
  publishedAt: string | null;
  version: number;
  updatedAt: string;
}

export interface AdminProductRow {
  id: string;
  slug: string;
  title: string;
  status: ProductStatus;
  priceCents: number;
  imageUrl: string | null;
  variantCount: number;
  totalStock: number;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MediaAssetDto {
  id: string;
  url: string;
  width: number;
  height: number;
  widths: number[];
  mimeType: string;
  bytes: number;
}

export interface InventoryLevel {
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
}

export interface AdminCollection {
  id: string;
  slug: string;
  title: string;
  description: string;
  imageMediaId: string | null;
  imageUrl: string | null;
  productIds: string[];
  version: number;
}

export type CreateProductRequest = z.input<typeof createProductRequestSchema>;
export type UpdateProductRequest = z.input<typeof updateProductRequestSchema>;
export type AddVariantRequest = z.input<typeof addVariantRequestSchema>;
export type UpdateVariantRequest = z.input<typeof updateVariantRequestSchema>;
export type StockAdjustmentRequest = z.input<typeof stockAdjustmentRequestSchema>;
export type CreateCollectionRequest = z.input<typeof createCollectionRequestSchema>;
