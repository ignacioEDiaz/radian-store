import { describe, expect, it } from 'vitest';
import { Product } from '../../../../src/modules/catalog/domain/product.js';
import { Slug } from '../../../../src/modules/catalog/domain/slug.js';
import { Collection } from '../../../../src/modules/catalog/domain/collection.js';
import { DomainError, ConflictError } from '../../../../src/shared/domain/errors.js';

const now = new Date('2026-11-10T12:00:00Z');
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function draft(overrides: Partial<Parameters<typeof Product.create>[0]> = {}) {
  return Product.create({
    id: id(),
    slug: Slug.fromTitle('Sharp Leather Boot'),
    title: 'Sharp Leather Boot',
    description: 'Boot',
    productType: 'Footwear',
    materials: ['Leather'],
    tags: ['footwear'],
    priceCents: 45000,
    compareAtCents: 57692,
    now,
    ...overrides,
  });
}

const image = (color: string | null = null) => ({ id: id(), mediaId: id(), alt: 'Front', color, width: 1600, height: 2143, widths: [320, 640] });

describe('Slug', () => {
  it('se deriva del título y valida formato', () => {
    expect(Slug.fromTitle('  Ñandú & Café — Boot! ').value).toBe('nandu-cafe-boot');
    expect(Slug.create('sharp-boot').withSuffix(2).value).toBe('sharp-boot-2');
    expect(() => Slug.create('Con Espacios')).toThrow(DomainError);
  });
});

describe('Product', () => {
  it('nace en borrador y emite ProductCreated con snapshot', () => {
    const p = draft();
    expect(p.toSnapshot()).toMatchObject({ status: 'draft', slug: 'sharp-leather-boot', priceCents: 45000, variants: [], images: [] });
    expect(p.pullEvents().map((e) => e.type)).toEqual(['catalog.ProductCreated']);
  });

  it('valida precio, precio anterior y título', () => {
    expect(() => draft({ priceCents: 0 })).toThrow(/precio/i);
    expect(() => draft({ compareAtCents: 45000 })).toThrow(/anterior/i);
    expect(() => draft({ title: 'X' })).toThrow(DomainError);
    const p = draft();
    expect(() => p.updateDetails({ compareAtCents: 100 }, now)).toThrow(/anterior/i);
  });

  it('agrega variantes rechazando color+talle o SKU duplicados', () => {
    const p = draft();
    p.addVariant({ id: id(), sku: 'sb-ob-s', color: 'Obsidian Black', size: 'S', priceCents: null }, now);
    expect(p.toSnapshot().variants[0]).toMatchObject({ sku: 'SB-OB-S', position: 0 });
    expect(() => p.addVariant({ id: id(), sku: 'SB-OB-M', color: 'Obsidian Black', size: 's', priceCents: null }, now)).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_VARIANT' }),
    );
    expect(() => p.addVariant({ id: id(), sku: 'SB-OB-S', color: 'Obsidian Black', size: 'M', priceCents: null }, now)).toThrow(
      expect.objectContaining({ code: 'SKU_TAKEN' }),
    );
  });

  it('edita y elimina variantes', () => {
    const p = draft();
    const v = id();
    p.addVariant({ id: v, sku: 'A-1', color: 'Black', size: 'S', priceCents: null }, now);
    p.updateVariant(v, { priceCents: 50000, size: 'M' }, now);
    expect(p.toSnapshot().variants[0]).toMatchObject({ size: 'M', priceCents: 50000 });
    p.removeVariant(v, now);
    expect(p.toSnapshot().variants).toHaveLength(0);
    expect(() => p.removeVariant(v, now)).toThrow(expect.objectContaining({ code: 'VARIANT_NOT_FOUND' }));
  });

  it('gestiona imágenes: orden, principal, alt y borrado', () => {
    const p = draft();
    const a = image('Black');
    const b = image();
    p.attachImage(a, now);
    p.attachImage(b, now);
    p.reorderImages([b.id, a.id], now);
    expect(p.toSnapshot().images.map((i) => [i.id, i.position])).toEqual([
      [b.id, 0],
      [a.id, 1],
    ]);
    expect(() => p.reorderImages([b.id], now)).toThrow(expect.objectContaining({ code: 'INVALID_IMAGE_ORDER' }));
    p.updateImage(a.id, { alt: 'Side view' }, now);
    p.removeImage(b.id, now);
    expect(p.toSnapshot().images).toEqual([expect.objectContaining({ id: a.id, alt: 'Side view', position: 0 })]);
  });

  it('publicar exige variantes, imágenes y alt; luego puede despublicarse y archivarse', () => {
    const p = draft();
    expect(() => p.publish(now)).toThrow(expect.objectContaining({ code: 'NOT_PUBLISHABLE', meta: { reasons: ['NO_VARIANTS', 'NO_IMAGES'] } }));
    p.addVariant({ id: id(), sku: 'A-1', color: 'Black', size: 'S', priceCents: null }, now);
    p.attachImage({ ...image(), alt: ' ' }, now);
    expect(() => p.publish(now)).toThrow(expect.objectContaining({ meta: { reasons: ['IMAGE_WITHOUT_ALT'] } }));
    p.updateImage(p.toSnapshot().images[0]!.id, { alt: 'Front' }, now);
    p.publish(now);
    expect(p.toSnapshot()).toMatchObject({ status: 'published', publishedAt: now });
    p.unpublish(now);
    p.archive(now);
    expect(p.toSnapshot().status).toBe('archived');
    expect(() => p.publish(now)).toThrow(expect.objectContaining({ code: 'PRODUCT_ARCHIVED' }));
  });

  it('control de versión optimista', () => {
    const p = draft();
    expect(() => p.assertVersion(1)).not.toThrow();
    p.pullEvents();
    const loaded = Product.rehydrate({ ...p.toSnapshot(), version: 4 });
    expect(() => loaded.assertVersion(3)).toThrow(ConflictError);
  });

  it('los eventos de variantes informan el id afectado', () => {
    const p = draft();
    p.pullEvents();
    const v = id();
    p.addVariant({ id: v, sku: 'A-1', color: 'Black', size: 'S', priceCents: null }, now);
    expect(p.pullEvents()[0]).toMatchObject({ type: 'catalog.VariantAdded', payload: { variantId: v, snapshot: { version: 2 } } });
  });
});

describe('Collection', () => {
  it('ordena productos sin duplicados y permite quitar uno', () => {
    const c = Collection.create({ id: id(), slug: Slug.fromTitle('Tops'), title: 'Tops', description: '', image: null, now });
    const [a, b] = [id(), id()];
    c.setProducts([a, b, a], now);
    expect(c.toSnapshot().productIds).toEqual([a, b]);
    c.removeProduct(a, now);
    expect(c.toSnapshot().productIds).toEqual([b]);
    expect(c.pullEvents().map((e) => e.type)).toEqual(['catalog.CollectionCreated', 'catalog.CollectionProductsSet', 'catalog.CollectionProductsSet']);
  });
});
