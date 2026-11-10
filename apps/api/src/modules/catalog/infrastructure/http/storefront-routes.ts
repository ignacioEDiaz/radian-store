import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { productListQuerySchema, suggestionsQuerySchema } from '@radian/contracts';
import { etagOnSend } from '../../../../shared/infrastructure/http/etag.js';
import { parseParams, parseQuery } from '../../../../shared/infrastructure/http/validation.js';
import type { StorefrontQueries } from '../../application/queries/storefront-queries.js';

const slugParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) });

/** API pública de la tienda (solo lectura). */
export function registerStorefrontRoutes(app: FastifyInstance, queries: StorefrontQueries) {
  return app.register(async (s) => {
    s.addHook('onSend', etagOnSend);
    s.get('/api/catalog/products', async (req) => queries.listProducts(parseQuery(productListQuerySchema, req.query)));
    s.get('/api/catalog/products/:slug', async (req) => queries.getProduct(parseParams(slugParams, req.params).slug));
    s.get('/api/catalog/collections', async () => queries.listCollections());
    s.get('/api/catalog/collections/:slug', async (req) => queries.getCollection(parseParams(slugParams, req.params).slug));
    s.get('/api/catalog/search/suggestions', async (req) => queries.suggestions(parseQuery(suggestionsQuerySchema, req.query).q));
    s.get('/api/catalog/home', async () => queries.home());
  });
}
