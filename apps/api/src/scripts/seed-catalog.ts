/** Importa el catálogo semilla de Radian (idempotente). Uso: npm run seed:catalog -w @radian/api */
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/env.js';
import { createPool } from '../shared/infrastructure/db/pool.js';
import { createLogger } from '../shared/infrastructure/observability/logger.js';
import { Metrics } from '../shared/infrastructure/observability/metrics.js';
import { createCatalogModule } from '../modules/catalog/index.js';
import { createMediaModule } from '../modules/media/index.js';
import { importCatalog } from '../modules/catalog/infrastructure/seed/import-catalog.js';
import type { AuthGuards } from '../shared/infrastructure/http/auth.js';

const config = loadConfig();
const metrics = new Metrics();
const logger = createLogger('warn');
const writeDb = createPool({ name: 'write', ...config.db.write }, metrics, logger);
const readDb = createPool({ name: 'read', ...config.db.read }, metrics, logger);
const guards = {} as AuthGuards; // el seed no expone rutas
const catalog = createCatalogModule({ writeDb, readDb, guards });
const media = createMediaModule({ writeDb, guards, metrics, mediaDir: config.mediaDir });
const seedDir = process.argv[2] ?? fileURLToPath(new URL('../../seed/radian/', import.meta.url));

const t0 = Date.now();
const result = await importCatalog({ writeDb, products: catalog.products, collections: catalog.collections, upload: media.upload, seedDir, log: console.log });
console.log(`Listo en ${((Date.now() - t0) / 1000).toFixed(1)} s: ${result.productsCreated} productos y ${result.collectionsCreated} colecciones nuevas.`);
console.log('El proyector de la API sincroniza la base de lectura en segundos.');
await Promise.all([writeDb.end(), readDb.end()]);
