import { z } from 'zod';

/** Acepta `?color=a&color=b` (array) o `?color=a` (string). */
const many = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter(Boolean)))
  .pipe(z.array(z.string().max(40)).max(20));

const cents = z.coerce.number().int().min(0).optional();

export const SORTS = ['featured', 'newest', 'price_asc', 'price_desc', 'best_selling'] as const;
export const PAGE_SIZE = 24;

export const productListQuerySchema = z
  .object({
    collection: z.string().trim().max(80).optional(),
    q: z.string().trim().max(60).optional(),
    color: many,
    size: many,
    material: many,
    type: many,
    minPrice: cents,
    maxPrice: cents,
    available: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
    sort: z.enum(SORTS).default('featured'),
    page: z.coerce.number().int().min(1).max(500).default(1),
  })
  .refine((f) => f.minPrice === undefined || f.maxPrice === undefined || f.minPrice <= f.maxPrice, {
    message: 'El precio mínimo no puede superar al máximo',
    path: ['minPrice'],
  });

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type ProductSort = (typeof SORTS)[number];

export const suggestionsQuerySchema = z.object({ q: z.string().trim().min(2).max(60) });

export interface ImageView {
  url: string;
  srcset: { width: number; url: string }[];
  alt: string;
  width: number;
  height: number;
  color: string | null;
}

export interface ProductCard {
  id: string;
  slug: string;
  title: string;
  productType: string;
  priceCents: number;
  compareAtCents: number | null;
  image: ImageView | null;
  hoverImage: ImageView | null;
  colors: string[];
  available: boolean;
  isNew: boolean;
}

export interface VariantView {
  id: string;
  sku: string;
  color: string;
  size: string;
  priceCents: number;
  available: boolean;
  availableQty: number;
}

export interface ProductDetail extends ProductCard {
  description: string;
  materials: string[];
  images: ImageView[];
  variants: VariantView[];
  options: { colors: string[]; sizes: string[] };
  related: ProductCard[];
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface Facets {
  colors: FacetValue[];
  sizes: FacetValue[];
  materials: FacetValue[];
  types: FacetValue[];
  price: { min: number; max: number };
}

export interface ProductList {
  items: ProductCard[];
  total: number;
  page: number;
  pageSize: number;
  facets: Facets;
}

export interface CollectionView {
  id: string;
  slug: string;
  title: string;
  description: string;
  image: ImageView | null;
  productCount: number;
}

export interface Home {
  featuredCollections: CollectionView[];
  newArrivals: ProductCard[];
  bestSellers: ProductCard[];
}

export interface Suggestions {
  products: ProductCard[];
  collections: CollectionView[];
}
