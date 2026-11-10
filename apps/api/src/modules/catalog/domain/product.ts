import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { ConflictError, DomainError, NotFoundError } from '../../../shared/domain/errors.js';
import type { Slug } from './slug.js';
import type { ImageSnapshot, ProductEvent, ProductSnapshot, VariantSnapshot } from './events.js';

type State = Omit<ProductSnapshot, 'id' | 'version'>;

export interface ProductDetails {
  title: string;
  description: string;
  productType: string;
  materials: string[];
  tags: string[];
  priceCents: number;
  compareAtCents: number | null;
}

const SKU = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

function text(value: string, field: string, min: number, max: number): string {
  const v = value.trim();
  if (v.length < min || v.length > max) throw new DomainError('INVALID_PRODUCT', `${field} debe tener entre ${min} y ${max} caracteres`, { field });
  return v;
}

const list = (values: string[]) => [...new Set(values.map((v) => v.trim()).filter(Boolean))];

function prices(priceCents: number, compareAtCents: number | null) {
  if (!Number.isInteger(priceCents) || priceCents <= 0) throw new DomainError('INVALID_PRICE', 'El precio debe ser mayor a 0 (en centavos)');
  if (compareAtCents !== null && (!Number.isInteger(compareAtCents) || compareAtCents <= priceCents)) {
    throw new DomainError('INVALID_COMPARE_AT_PRICE', 'El precio anterior debe ser mayor al precio');
  }
}

/** Producto del catálogo con sus variantes e imágenes (agregado del contexto catalog). */
export class Product extends AggregateRoot<ProductEvent> {
  readonly aggregateType = 'Product';

  private constructor(id: string, version: number, private s: State) {
    super(id, version);
  }

  static create(input: ProductDetails & { id: string; slug: Slug; now: Date }): Product {
    prices(input.priceCents, input.compareAtCents);
    const p = new Product(input.id, 0, {
      slug: input.slug.value,
      title: text(input.title, 'El título', 2, 120),
      description: text(input.description, 'La descripción', 0, 5000),
      productType: text(input.productType, 'El tipo', 2, 40),
      materials: list(input.materials),
      tags: list(input.tags),
      priceCents: input.priceCents,
      compareAtCents: input.compareAtCents,
      status: 'draft',
      featuredRank: null,
      variants: [],
      images: [],
      publishedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
    p.emit('catalog.ProductCreated', input.now, {});
    return p;
  }

  static rehydrate(snapshot: ProductSnapshot): Product {
    const { id, version, ...state } = snapshot;
    return new Product(id, version, structuredClone(state));
  }

  get slug(): string {
    return this.s.slug;
  }
  get status() {
    return this.s.status;
  }

  assertVersion(expected: number): void {
    if (expected !== this.version) {
      throw new ConflictError('VERSION_CONFLICT', 'El producto fue modificado por otra persona. Recargá para ver los cambios.', {
        currentVersion: this.version,
      });
    }
  }

  updateDetails(changes: Partial<ProductDetails>, now: Date): void {
    this.assertEditable();
    const next = { ...this.s };
    if (changes.title !== undefined) next.title = text(changes.title, 'El título', 2, 120);
    if (changes.description !== undefined) next.description = text(changes.description, 'La descripción', 0, 5000);
    if (changes.productType !== undefined) next.productType = text(changes.productType, 'El tipo', 2, 40);
    if (changes.materials !== undefined) next.materials = list(changes.materials);
    if (changes.tags !== undefined) next.tags = list(changes.tags);
    if (changes.priceCents !== undefined) next.priceCents = changes.priceCents;
    if (changes.compareAtCents !== undefined) next.compareAtCents = changes.compareAtCents;
    prices(next.priceCents, next.compareAtCents);
    this.s = { ...next, updatedAt: now };
    this.emit('catalog.ProductDetailsUpdated', now, {});
  }

  addVariant(input: { id: string; sku: string; color: string; size: string; priceCents: number | null }, now: Date): void {
    this.assertEditable();
    const variant = this.validVariant({ ...input, position: this.s.variants.length });
    this.s = { ...this.s, variants: [...this.s.variants, variant], updatedAt: now };
    this.emit('catalog.VariantAdded', now, { variantId: variant.id });
  }

  updateVariant(variantId: string, changes: Partial<Pick<VariantSnapshot, 'sku' | 'color' | 'size' | 'priceCents'>>, now: Date): void {
    this.assertEditable();
    const current = this.variant(variantId);
    const updated = this.validVariant({ ...current, ...changes }, variantId);
    this.s = { ...this.s, variants: this.s.variants.map((v) => (v.id === variantId ? updated : v)), updatedAt: now };
    this.emit('catalog.VariantUpdated', now, { variantId });
  }

  removeVariant(variantId: string, now: Date): void {
    this.assertEditable();
    this.variant(variantId);
    const variants = this.s.variants.filter((v) => v.id !== variantId).map((v, position) => ({ ...v, position }));
    this.s = { ...this.s, variants, updatedAt: now };
    this.emit('catalog.VariantRemoved', now, { variantId });
  }

  attachImage(input: Omit<ImageSnapshot, 'position'>, now: Date): void {
    this.assertEditable();
    if (input.widths.length === 0) throw new DomainError('INVALID_IMAGE', 'La imagen no tiene tamaños disponibles');
    const image = { ...input, alt: input.alt.trim().slice(0, 200), position: this.s.images.length };
    this.s = { ...this.s, images: [...this.s.images, image], updatedAt: now };
    this.emit('catalog.ProductImageAttached', now, { imageId: image.id });
  }

  updateImage(imageId: string, changes: { alt?: string; color?: string | null }, now: Date): void {
    this.assertEditable();
    this.image(imageId);
    const images = this.s.images.map((i) =>
      i.id === imageId
        ? {
            ...i,
            ...(changes.alt !== undefined ? { alt: changes.alt.trim().slice(0, 200) } : {}),
            ...(changes.color !== undefined ? { color: changes.color } : {}),
          }
        : i,
    );
    this.s = { ...this.s, images, updatedAt: now };
    this.emit('catalog.ProductImageUpdated', now, { imageId });
  }

  reorderImages(imageIds: string[], now: Date): void {
    this.assertEditable();
    const current = new Set(this.s.images.map((i) => i.id));
    if (imageIds.length !== current.size || new Set(imageIds).size !== imageIds.length || !imageIds.every((id) => current.has(id))) {
      throw new DomainError('INVALID_IMAGE_ORDER', 'El orden debe incluir cada imagen exactamente una vez');
    }
    const images = imageIds.map((id, position) => ({ ...this.image(id), position }));
    this.s = { ...this.s, images, updatedAt: now };
    this.emit('catalog.ProductImagesReordered', now, {});
  }

  removeImage(imageId: string, now: Date): void {
    this.assertEditable();
    this.image(imageId);
    const images = this.s.images.filter((i) => i.id !== imageId).map((i, position) => ({ ...i, position }));
    this.s = { ...this.s, images, updatedAt: now };
    this.emit('catalog.ProductImageRemoved', now, { imageId });
  }

  publish(now: Date): void {
    this.assertEditable();
    if (this.s.status === 'published') return;
    const reasons: string[] = [];
    if (this.s.variants.length === 0) reasons.push('NO_VARIANTS');
    if (this.s.images.length === 0) reasons.push('NO_IMAGES');
    if (this.s.images.some((i) => i.alt.trim() === '')) reasons.push('IMAGE_WITHOUT_ALT');
    if (reasons.length) throw new DomainError('NOT_PUBLISHABLE', 'El producto no se puede publicar todavía', { reasons });
    this.s = { ...this.s, status: 'published', publishedAt: this.s.publishedAt ?? now, updatedAt: now };
    this.emit('catalog.ProductPublished', now, {});
  }

  unpublish(now: Date): void {
    if (this.s.status !== 'published') return;
    this.s = { ...this.s, status: 'draft', updatedAt: now };
    this.emit('catalog.ProductUnpublished', now, {});
  }

  archive(now: Date): void {
    if (this.s.status === 'archived') return;
    this.s = { ...this.s, status: 'archived', updatedAt: now };
    this.emit('catalog.ProductArchived', now, {});
  }

  setFeaturedRank(rank: number | null, now: Date): void {
    if (rank !== null && (!Number.isInteger(rank) || rank < 1)) throw new DomainError('INVALID_RANK', 'El orden destacado debe ser un entero ≥ 1');
    this.s = { ...this.s, featuredRank: rank, updatedAt: now };
    this.emit('catalog.ProductFeaturedRankChanged', now, {});
  }

  toSnapshot(): ProductSnapshot {
    return { id: this.id, version: this.version, ...structuredClone(this.s) };
  }

  private assertEditable(): void {
    if (this.s.status === 'archived') throw new DomainError('PRODUCT_ARCHIVED', 'El producto está archivado');
  }

  private variant(id: string): VariantSnapshot {
    const v = this.s.variants.find((x) => x.id === id);
    if (!v) throw new NotFoundError('VARIANT_NOT_FOUND', 'La variante no existe');
    return v;
  }

  private image(id: string): ImageSnapshot {
    const i = this.s.images.find((x) => x.id === id);
    if (!i) throw new NotFoundError('IMAGE_NOT_FOUND', 'La imagen no existe');
    return i;
  }

  private validVariant(v: VariantSnapshot, exceptId?: string): VariantSnapshot {
    const sku = v.sku.trim().toUpperCase();
    if (!SKU.test(sku)) throw new DomainError('INVALID_SKU', 'SKU inválido (A-Z, 0-9 y guiones, 3 a 40 caracteres)');
    const color = text(v.color, 'El color', 1, 40);
    const size = text(v.size, 'El talle', 1, 10).toUpperCase();
    if (v.priceCents !== null && (!Number.isInteger(v.priceCents) || v.priceCents <= 0)) {
      throw new DomainError('INVALID_PRICE', 'Precio de variante inválido');
    }
    const others = this.s.variants.filter((x) => x.id !== exceptId);
    if (others.some((x) => x.sku === sku)) throw new ConflictError('SKU_TAKEN', `El SKU ${sku} ya existe`);
    if (others.some((x) => x.color.toLowerCase() === color.toLowerCase() && x.size === size)) {
      throw new ConflictError('DUPLICATE_VARIANT', `Ya existe la variante ${color} / ${size}`);
    }
    return { id: v.id, sku, color, size, priceCents: v.priceCents, position: v.position };
  }

  private emit<T extends ProductEvent['type']>(type: T, now: Date, extra: Omit<Extract<ProductEvent, { type: T }>['payload'], 'snapshot'>): void {
    const snapshot = { ...this.toSnapshot(), version: this.version + 1 };
    this.record(type, { snapshot, ...extra } as never, now);
  }
}
