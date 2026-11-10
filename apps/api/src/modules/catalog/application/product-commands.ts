import type { AdminProduct } from '@radian/contracts';
import type { Clock, IdGenerator } from '../../../shared/application/ports.js';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.js';
import { DomainError, NotFoundError } from '../../../shared/domain/errors.js';
import { Product, type ProductDetails } from '../domain/product.js';
import { Slug } from '../domain/slug.js';
import type { VariantSnapshot } from '../domain/events.js';
import type { CatalogRepos } from './ports.js';
import { toAdminProduct } from './views.js';

interface Deps {
  uow: UnitOfWork<CatalogRepos>;
  clock: Clock;
  ids: IdGenerator;
}

type Versioned<T = object> = T & { productId: string; expectedVersion: number };

/**
 * Casos de uso de administración de productos. Cada uno: carga el agregado, verifica la versión
 * que vio el admin, aplica el cambio, guarda (estado + outbox) y devuelve el snapshot resultante.
 */
export class ProductCommands {
  constructor(private readonly d: Deps) {}

  createProduct(input: ProductDetails): Promise<AdminProduct> {
    return this.d.uow.run(async (r) => {
      const slug = await r.slugs.allocate('product', Slug.fromTitle(input.title));
      const product = Product.create({ ...input, id: this.d.ids.uuid(), slug, now: this.now() });
      await r.products.save(product);
      return toAdminProduct(product.toSnapshot(), new Map());
    });
  }

  updateDetails(input: Versioned<Partial<ProductDetails>>) {
    const { productId, expectedVersion, ...changes } = input;
    return this.mutate({ productId, expectedVersion }, (p) => p.updateDetails(changes, this.now()));
  }

  addVariant(input: Versioned<{ sku: string; color: string; size: string; priceCents: number | null; initialStock: number }>) {
    const variantId = this.d.ids.uuid();
    return this.mutate(input, async (p, r) => {
      p.addVariant({ id: variantId, sku: input.sku, color: input.color, size: input.size, priceCents: input.priceCents }, this.now());
      const sku = p.toSnapshot().variants.find((v) => v.id === variantId)!.sku;
      // Mismo UnitOfWork: el ítem de inventario nace en la misma transacción que la variante.
      return async () => r.inventory.provision({ variantId, productId: p.id, sku, onHand: input.initialStock });
    });
  }

  updateVariant(input: Versioned<{ variantId: string } & Partial<Pick<VariantSnapshot, 'sku' | 'color' | 'size' | 'priceCents'>>>) {
    const { productId, expectedVersion, variantId, ...changes } = input;
    return this.mutate({ productId, expectedVersion }, (p) => p.updateVariant(variantId, changes, this.now()));
  }

  removeVariant(input: Versioned<{ variantId: string }>) {
    return this.mutate(input, (p) => p.removeVariant(input.variantId, this.now()));
  }

  attachImage(input: Versioned<{ mediaId: string; alt: string; color: string | null }>) {
    const imageId = this.d.ids.uuid();
    return this.mutate(input, async (p, r) => {
      const media = await r.media.find(input.mediaId);
      if (!media) throw new NotFoundError('MEDIA_NOT_FOUND', 'La imagen subida no existe');
      p.attachImage({ id: imageId, mediaId: media.id, alt: input.alt, color: input.color, width: media.width, height: media.height, widths: media.widths }, this.now());
    });
  }

  updateImage(input: Versioned<{ imageId: string; alt?: string | undefined; color?: string | null | undefined }>) {
    const changes = {
      ...(input.alt !== undefined ? { alt: input.alt } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    };
    return this.mutate(input, (p) => p.updateImage(input.imageId, changes, this.now()));
  }

  reorderImages(input: Versioned<{ imageIds: string[] }>) {
    return this.mutate(input, (p) => p.reorderImages(input.imageIds, this.now()));
  }

  removeImage(input: Versioned<{ imageId: string }>) {
    return this.mutate(input, (p) => p.removeImage(input.imageId, this.now()));
  }

  publish(input: Versioned) {
    return this.mutate(input, (p) => p.publish(this.now()));
  }

  unpublish(input: Versioned) {
    return this.mutate(input, (p) => p.unpublish(this.now()));
  }

  archive(input: Versioned) {
    return this.mutate(input, (p) => p.archive(this.now()));
  }

  setFeaturedRank(input: Versioned<{ rank: number | null }>) {
    return this.mutate(input, (p) => p.setFeaturedRank(input.rank, this.now()));
  }

  private now() {
    return this.d.clock.now();
  }

  /** Plantilla común: el `change` puede devolver un efecto a ejecutar después de guardar el producto. */
  private mutate(
    input: { productId: string; expectedVersion: number },
    change: (p: Product, r: CatalogRepos) => void | Promise<void | (() => Promise<void>)>,
  ): Promise<AdminProduct> {
    return this.d.uow.run(async (r) => {
      const product = await r.products.findById(input.productId);
      if (!product) throw new NotFoundError('PRODUCT_NOT_FOUND', 'El producto no existe');
      product.assertVersion(input.expectedVersion);
      const after = await change(product, r);
      if (!product.hasChanges) throw new DomainError('NO_CHANGES', 'No hay cambios para guardar');
      await r.products.save(product);
      if (after) await after();
      return toAdminProduct(product.toSnapshot(), await r.inventory.levels(product.id));
    });
  }
}
