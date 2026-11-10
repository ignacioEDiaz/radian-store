import type { AdminProduct } from '@radian/contracts';
import { createCatalogModule } from '../../src/modules/catalog/index.js';
import { createMediaModule } from '../../src/modules/media/index.js';
import type { Infrastructure } from '../../src/infrastructure.js';
import type { AuthGuards } from '../../src/shared/infrastructure/http/auth.js';
import { Metrics } from '../../src/shared/infrastructure/observability/metrics.js';
import { png } from './images.js';

export interface ProductSpec {
  title: string;
  type?: string;
  materials?: string[];
  price?: number;
  compareAt?: number | null;
  variants?: { color: string; size: string; stock: number }[];
  publish?: boolean;
  featuredRank?: number | null;
}

/** Siembra productos usando los casos de uso reales (como el panel) y proyecta. */
export async function seedCatalog(infra: Infrastructure, mediaDir: string, specs: ProductSpec[]) {
  const guards = {} as AuthGuards;
  const catalog = createCatalogModule({ writeDb: infra.writeDb, readDb: infra.readDb, guards });
  const media = createMediaModule({ writeDb: infra.writeDb, guards, metrics: new Metrics(), mediaDir });
  const created: AdminProduct[] = [];
  let n = 0;
  for (const s of specs) {
    let p = await catalog.products.createProduct({
      title: s.title,
      description: `${s.title} description`,
      productType: s.type ?? 'Tops',
      materials: s.materials ?? ['Cotton'],
      tags: [],
      priceCents: s.price ?? 10_000,
      compareAtCents: s.compareAt ?? null,
    });
    const v = () => ({ productId: p.id, expectedVersion: p.version });
    for (const variant of s.variants ?? [{ color: 'Black', size: 'M', stock: 5 }]) {
      n += 1;
      p = await catalog.products.addVariant({ ...v(), sku: `SKU-${n}-${variant.size}`, color: variant.color, size: variant.size, priceCents: null, initialStock: variant.stock });
    }
    // Una imagen distinta por producto (el contenido define el sha256).
    const { asset } = await media.upload.execute(await png(400 + created.length, 500));
    p = await catalog.products.attachImage({ ...v(), mediaId: asset.id, alt: `${s.title} front`, color: null });
    if (s.featuredRank !== undefined && s.featuredRank !== null) p = await catalog.products.setFeaturedRank({ ...v(), rank: s.featuredRank });
    if (s.publish !== false) p = await catalog.products.publish(v());
    created.push(p);
  }
  await drain(infra);
  return { products: created, catalog };
}

/** Procesa el outbox hasta vaciarlo. */
export async function drain(infra: Infrastructure) {
  for (let i = 0; i < 20; i += 1) if ((await infra.projector.runOnce()) === 0) return;
}
