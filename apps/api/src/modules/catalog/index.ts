import type { Clock, IdGenerator } from '../../shared/application/ports.js';
import { randomIds, systemClock } from '../../shared/application/ports.js';
import type { DbPool, TxClient } from '../../shared/infrastructure/db/pool.js';
import { createUnitOfWork, inTransaction } from '../../shared/infrastructure/db/unit-of-work.js';
import type { AuthGuards } from '../../shared/infrastructure/http/auth.js';
import type { EventConsumer } from '../../shared/infrastructure/outbox/consumer.js';
import type { BoundedContext } from '../types.js';
import type { Cache } from '../../shared/application/cache.js';
import { NullCache } from '../../shared/infrastructure/cache/null-cache.js';
import { StorefrontQueries } from './application/queries/storefront-queries.js';
import { registerStorefrontRoutes } from './infrastructure/http/storefront-routes.js';
import { PgCatalogReadModel } from './infrastructure/read-model/pg-catalog-read-model.js';
import { PgInventoryProvisioner } from '../inventory/infrastructure/inventory-provisioner.js';
import { PgMediaLookup } from '../media/infrastructure/pg-media-repository.js';
import { CollectionCommands } from './application/collection-commands.js';
import type { CatalogRepos } from './application/ports.js';
import { ProductCommands } from './application/product-commands.js';
import { registerAdminCatalogRoutes } from './infrastructure/http/admin-catalog-routes.js';
import { PgCollectionRepository } from './infrastructure/persistence/pg-collection-repository.js';
import { PgProductRepository } from './infrastructure/persistence/pg-product-repository.js';
import { PgSlugAllocator } from './infrastructure/persistence/pg-slug-allocator.js';
import { catalogProjection } from './infrastructure/projections/catalog-projection.js';
import { PgAdminCatalogReader } from './infrastructure/read-model/pg-admin-catalog-reader.js';

export interface CatalogModuleDeps {
  writeDb: DbPool;
  readDb: DbPool;
  guards: AuthGuards;
  /** Caché de consultas de la tienda (Redis en producción). */
  cache?: Cache;
  clock?: Clock;
  ids?: IdGenerator;
}

/**
 * Contexto catalog. Se conecta con inventory y media solo mediante puertos
 * (InventoryProvisioner, MediaLookup) implementados por adaptadores de esos contextos.
 */
export function createCatalogModule(d: CatalogModuleDeps) {
  const clock = d.clock ?? systemClock;
  const ids = d.ids ?? randomIds;
  const repos = (tx: TxClient): CatalogRepos => ({
    products: new PgProductRepository(tx),
    collections: new PgCollectionRepository(tx),
    slugs: new PgSlugAllocator(tx),
    inventory: new PgInventoryProvisioner(tx, clock),
    media: new PgMediaLookup(tx),
  });
  const uow = createUnitOfWork(d.writeDb, repos);
  const products = new ProductCommands({ uow, clock, ids });
  const collections = new CollectionCommands({ uow, clock, ids });
  const storefront = new StorefrontQueries({ readModel: new PgCatalogReadModel(d.readDb), cache: d.cache ?? new NullCache() });

  /** Política (write): un producto archivado sale de todas sus colecciones. */
  const removeArchivedFromCollections: EventConsumer = {
    name: 'catalog.remove-archived-from-collections',
    target: 'write',
    handles: ['catalog.ProductArchived'],
    async apply(event, tx) {
      await new CollectionCommands({ uow: inTransaction(tx, repos), clock, ids }).removeProductEverywhere(event.aggregateId);
    },
  };

  const context: BoundedContext = {
    consumers: [catalogProjection, removeArchivedFromCollections],
    appModule: {
      name: 'catalog',
      register: async (app) => {
        await registerStorefrontRoutes(app, storefront);
        await registerAdminCatalogRoutes(app, { products, collections, reader: new PgAdminCatalogReader(d.readDb), guards: d.guards });
      },
    },
  };
  return { context, products, collections, storefront };
}
