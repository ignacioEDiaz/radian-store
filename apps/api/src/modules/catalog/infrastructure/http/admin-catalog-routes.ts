import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addVariantRequestSchema,
  adminProductsQuerySchema,
  attachImageRequestSchema,
  createCollectionRequestSchema,
  createProductRequestSchema,
  featuredRankRequestSchema,
  reorderImagesRequestSchema,
  setCollectionProductsRequestSchema,
  updateCollectionRequestSchema,
  updateImageRequestSchema,
  updateProductRequestSchema,
  updateVariantRequestSchema,
  versionOnlyRequestSchema,
} from '@radian/contracts';
import { NotFoundError } from '../../../../shared/domain/errors.js';
import type { AuthGuards } from '../../../../shared/infrastructure/http/auth.js';
import { parseBody, parseParams, parseQuery } from '../../../../shared/infrastructure/http/validation.js';
import type { CollectionCommands } from '../../application/collection-commands.js';
import type { AdminCatalogReader } from '../../application/ports.js';
import type { ProductCommands } from '../../application/product-commands.js';

const id = z.uuid();
const productParams = z.object({ id });
const variantParams = z.object({ id, variantId: id });
const imageParams = z.object({ id, imageId: id });
const versionQuery = z.object({ expectedVersion: z.coerce.number().int().nonnegative() });

export interface AdminCatalogDeps {
  products: ProductCommands;
  collections: CollectionCommands;
  reader: AdminCatalogReader;
  guards: AuthGuards;
}

export function registerAdminCatalogRoutes(app: FastifyInstance, d: AdminCatalogDeps) {
  return app.register(async (s) => {
    s.addHook('preHandler', d.guards.requireRole('admin'));

    // --- Productos ---
    s.get('/api/admin/products', async (req) => {
      const q = parseQuery(adminProductsQuerySchema, req.query);
      return d.reader.listProducts({ ...q, pageSize: 50 });
    });

    s.post('/api/admin/products', async (req, reply) => reply.status(201).send(await d.products.createProduct(parseBody(createProductRequestSchema, req.body))));

    s.get('/api/admin/products/:id', async (req) => {
      const product = await d.reader.getProduct(parseParams(productParams, req.params).id);
      if (!product) throw new NotFoundError('PRODUCT_NOT_FOUND', 'El producto no existe');
      return product;
    });

    s.patch('/api/admin/products/:id', async (req) => {
      const { id: productId } = parseParams(productParams, req.params);
      return d.products.updateDetails({ productId, ...stripUndefined(parseBody(updateProductRequestSchema, req.body)) });
    });

    s.post('/api/admin/products/:id/variants', async (req, reply) => {
      const { id: productId } = parseParams(productParams, req.params);
      return reply.status(201).send(await d.products.addVariant({ productId, ...parseBody(addVariantRequestSchema, req.body) }));
    });

    s.patch('/api/admin/products/:id/variants/:variantId', async (req) => {
      const { id: productId, variantId } = parseParams(variantParams, req.params);
      return d.products.updateVariant({ productId, variantId, ...stripUndefined(parseBody(updateVariantRequestSchema, req.body)) });
    });

    s.delete('/api/admin/products/:id/variants/:variantId', async (req) => {
      const { id: productId, variantId } = parseParams(variantParams, req.params);
      return d.products.removeVariant({ productId, variantId, ...parseQuery(versionQuery, req.query) });
    });

    s.post('/api/admin/products/:id/images', async (req, reply) => {
      const { id: productId } = parseParams(productParams, req.params);
      return reply.status(201).send(await d.products.attachImage({ productId, ...parseBody(attachImageRequestSchema, req.body) }));
    });

    s.patch('/api/admin/products/:id/images/:imageId', async (req) => {
      const { id: productId, imageId } = parseParams(imageParams, req.params);
      return d.products.updateImage({ productId, imageId, ...parseBody(updateImageRequestSchema, req.body) });
    });

    s.put('/api/admin/products/:id/images/order', async (req) => {
      const { id: productId } = parseParams(productParams, req.params);
      return d.products.reorderImages({ productId, ...parseBody(reorderImagesRequestSchema, req.body) });
    });

    s.delete('/api/admin/products/:id/images/:imageId', async (req) => {
      const { id: productId, imageId } = parseParams(imageParams, req.params);
      return d.products.removeImage({ productId, imageId, ...parseQuery(versionQuery, req.query) });
    });

    for (const action of ['publish', 'unpublish', 'archive'] as const) {
      s.post(`/api/admin/products/:id/${action}`, async (req) => {
        const { id: productId } = parseParams(productParams, req.params);
        return d.products[action]({ productId, ...parseBody(versionOnlyRequestSchema, req.body) });
      });
    }

    s.put('/api/admin/products/:id/featured-rank', async (req) => {
      const { id: productId } = parseParams(productParams, req.params);
      return d.products.setFeaturedRank({ productId, ...parseBody(featuredRankRequestSchema, req.body) });
    });

    // --- Colecciones ---
    s.get('/api/admin/collections', async () => d.reader.listCollections());

    s.post('/api/admin/collections', async (req, reply) => reply.status(201).send(await d.collections.create(parseBody(createCollectionRequestSchema, req.body))));

    s.patch('/api/admin/collections/:id', async (req) => {
      const { id: collectionId } = parseParams(productParams, req.params);
      return d.collections.update({ collectionId, ...parseBody(updateCollectionRequestSchema, req.body) });
    });

    s.put('/api/admin/collections/:id/products', async (req) => {
      const { id: collectionId } = parseParams(productParams, req.params);
      return d.collections.setProducts({ collectionId, ...parseBody(setCollectionProductsRequestSchema, req.body) });
    });
  });
}

/** Con exactOptionalPropertyTypes, quita claves `undefined` antes de pasar cambios parciales. */
function stripUndefined<T extends object>(obj: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as { [K in keyof T]: Exclude<T[K], undefined> };
}
