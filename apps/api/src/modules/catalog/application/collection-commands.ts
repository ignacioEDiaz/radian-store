import type { AdminCollection } from '@radian/contracts';
import type { Clock, IdGenerator } from '../../../shared/application/ports.js';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.js';
import { DomainError, NotFoundError } from '../../../shared/domain/errors.js';
import { Collection } from '../domain/collection.js';
import type { CollectionImage } from '../domain/events.js';
import { Slug } from '../domain/slug.js';
import type { CatalogRepos } from './ports.js';
import { toAdminCollection } from './views.js';

export class CollectionCommands {
  constructor(private readonly d: { uow: UnitOfWork<CatalogRepos>; clock: Clock; ids: IdGenerator }) {}

  create(input: { title: string; description: string; imageMediaId: string | null }): Promise<AdminCollection> {
    return this.d.uow.run(async (r) => {
      const slug = await r.slugs.allocate('collection', Slug.fromTitle(input.title));
      const collection = Collection.create({
        id: this.d.ids.uuid(),
        slug,
        title: input.title,
        description: input.description,
        image: await this.image(r, input.imageMediaId),
        now: this.d.clock.now(),
      });
      await r.collections.save(collection);
      return toAdminCollection(collection.toSnapshot());
    });
  }

  update(input: { collectionId: string; expectedVersion: number; title?: string | undefined; description?: string | undefined; imageMediaId?: string | null | undefined }) {
    return this.mutate(input, async (c, r) => {
      c.update(
        {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.imageMediaId !== undefined ? { image: await this.image(r, input.imageMediaId) } : {}),
        },
        this.d.clock.now(),
      );
    });
  }

  setProducts(input: { collectionId: string; expectedVersion: number; productIds: string[] }) {
    return this.mutate(input, async (c, r) => {
      for (const id of new Set(input.productIds)) {
        if (!(await r.products.findById(id))) throw new DomainError('UNKNOWN_PRODUCT', `El producto ${id} no existe`, { productId: id });
      }
      c.setProducts(input.productIds, this.d.clock.now());
    });
  }

  /** Política: un producto archivado sale de todas las colecciones. */
  removeProductEverywhere(productId: string): Promise<void> {
    return this.d.uow.run(async (r) => {
      for (const c of await r.collections.findContaining(productId)) {
        c.removeProduct(productId, this.d.clock.now());
        await r.collections.save(c);
      }
    });
  }

  private async image(r: CatalogRepos, mediaId: string | null): Promise<CollectionImage | null> {
    if (mediaId === null) return null;
    const media = await r.media.find(mediaId);
    if (!media) throw new NotFoundError('MEDIA_NOT_FOUND', 'La imagen subida no existe');
    return { mediaId: media.id, width: media.width, height: media.height, widths: media.widths };
  }

  private mutate(input: { collectionId: string; expectedVersion: number }, change: (c: Collection, r: CatalogRepos) => Promise<void>) {
    return this.d.uow.run(async (r) => {
      const c = await r.collections.findById(input.collectionId);
      if (!c) throw new NotFoundError('COLLECTION_NOT_FOUND', 'La colección no existe');
      c.assertVersion(input.expectedVersion);
      await change(c, r);
      await r.collections.save(c);
      return toAdminCollection(c.toSnapshot());
    });
  }
}
