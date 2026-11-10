/**
 * Extrae el catálogo de la tienda Radian original desde el scrape (HTML + _mapa.json + imágenes)
 * y genera `apps/api/seed/radian/catalog.json` + imágenes WebP (máx. 1600 px).
 *
 * Uso: npx tsx tools/extract-radian-catalog.ts <dir-del-scrape/sitio> [apps/api/seed/radian]
 */
import { mkdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [siteDir, outDirArg] = process.argv.slice(2);
if (!siteDir) {
  console.error('Uso: tsx tools/extract-radian-catalog.ts <sitio> [outDir]');
  process.exit(1);
}
const outDir = outDirArg ?? 'apps/api/seed/radian';
const html = readFileSync(path.join(siteDir, 'index.original.html'), 'utf8');
const mapa = JSON.parse(readFileSync(path.join(siteDir, '_mapa.json'), 'utf8')) as Record<string, { f: string }>;

const SIZES = ['S', 'M', 'L', 'XL'];
const SKIP = new Set(['gift-wrapping']);

/** Clasificación editorial (tipo, colecciones, materiales) revisable a mano. */
function classify(handle: string, title: string) {
  const t = `${handle} ${title}`.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));
  let type = 'Tops';
  if (has('boot', 'loafer', 'chelsea')) type = 'Footwear';
  else if (has('gauntlet', 'glove')) type = 'Accessories';
  else if (has('blazer')) type = 'Blazers';
  else if (has('trench', 'jacket', 'cape', 'coat', 'vest')) type = 'Outerwear';
  else if (has('dress', 'mini', 'maxi', 'column', 'robe', 'slip', 'shift', 'kimono', 'midi')) type = 'Dresses';
  else if (has('skirt')) type = 'Skirts';
  else if (has('trouser', 'culotte', 'jogger', 'cargo', 'pant')) type = 'Bottoms';
  else if (has('cardigan', 'pullover', 'knit')) type = 'Knitwear';
  const materials: string[] = [];
  if (has('leather', 'kuro', 'sharp-boot', 'ink-boots', 'gauntlet', 'chelsea', 'loafer')) materials.push('Leather');
  if (has('wool', 'blazer', 'sable', 'trench', 'cardigan', 'pullover')) materials.push('Wool');
  if (has('cotton', 'hoodie', 'tee', 'overshirt', 'shirt', 'stonewash', 'woven', 'cargo')) materials.push('Cotton');
  if (has('chiffon', 'mesh', 'slip', 'draped', 'pleated', 'mist', 'haze')) materials.push('Chiffon');
  if (has('jersey', 'jogger', 'tunic')) materials.push('Jersey');
  if (materials.length === 0) materials.push('Cotton');
  const collections = new Set<string>([type.toLowerCase()]);
  if (type === 'Skirts') collections.add('bottoms');
  if (type === 'Blazers') collections.add('outerwear');
  if (materials.includes('Leather')) collections.add('leathers');
  if (materials.includes('Cotton')) collections.add('cotton');
  return { type, materials, collections: [...collections] };
}

const DESCRIPTION: Record<string, string> = {
  Footwear: 'Built on a sculpted sole with a clean, elongated silhouette. Smooth upper, cushioned footbed and a quiet tread made for the city.',
  Accessories: 'Finishing pieces cut close to the hand, with a soft lining and clean seams that read sharp from every angle.',
  Blazers: 'Sharp shoulders, soft construction. Cut from Italian wool and finished by hand so it holds its line from the first wear to the hundredth.',
  Outerwear: 'A considered outer layer with a strong silhouette, built for weather and for the city at night. Fully lined with clean, minimal hardware.',
  Dresses: 'Fluid lines and a precise drape that moves with you, from the first meeting to the last call.',
  Skirts: 'A fluid skirt with movement in every step, cut to sit cleanly at the waist and pair with sharp tailoring.',
  Bottoms: 'Clean lines, a considered rise and a relaxed leg that pairs with everything from tailoring to tees.',
  Knitwear: 'Soft structure in a dense knit, designed to layer under tailoring or to wear alone with confidence.',
  Tops: 'An elevated essential with a clean neckline and a relaxed, boxy shape. Designed for effortless layering.',
};

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const cents = (s: string) => Math.round(Number(s.replace(/[^0-9.]/g, '')) * 100);

/** Archivos locales disponibles por "basename" de imagen (eligiendo la variante más grande). */
const filesByBase = new Map<string, string>();
for (const { f } of Object.values(mapa)) {
  const m = /^cdn\/shop\/files\/(.+?)(?:__[0-9a-f]{10})?\.(png|jpe?g|webp)$/.exec(f);
  if (!m) continue;
  const full = path.join(siteDir, f);
  if (!existsSync(full)) continue;
  const prev = filesByBase.get(m[1]!);
  if (!prev || statSync(full).size > statSync(prev).size) filesByBase.set(m[1]!, full);
}

/** Tarjetas de producto del HTML (primera aparición de cada handle). */
const cardStarts = [...html.matchAll(/class="product-card[ "]/g)].map((m) => m.index!);
const cards = new Map<string, string>();
cardStarts.forEach((start, i) => {
  const card = html.slice(start, cardStarts[i + 1] ?? start + 20_000);
  const handle = /href="\/products\/([a-z0-9-]+)"/.exec(card)?.[1];
  if (handle && !SKIP.has(handle) && !cards.has(handle)) cards.set(handle, card);
});
/** Productos sin tarjeta pero con el JSON de variantes de Shopify embebido (fuente más precisa). */
interface ShopifyVariant { name: string; option1: string; price: number; compare_at_price: number | null; featured_image?: { src: string } }
for (const m of html.matchAll(/<script[^>]*type="application\/json"[^>]*>(\[\{"id":\d+[\s\S]*?\])<\/script>/g)) {
  const variants = JSON.parse(m[1]!) as ShopifyVariant[];
  const handle = /\/files\/([a-z0-9-]+?)-(?:obsidian|oxblood|bone|chocolate|charcoal)/.exec(variants[0]?.featured_image?.src ?? '')?.[1];
  if (!handle || cards.has(handle) || SKIP.has(handle)) continue;
  const v0 = variants[0]!;
  const colors = [...new Set(variants.map((v) => v.option1))];
  const fake = `<a class="product-card-info__link">${v0.name.split(' - ')[0]}</a> $${(v0.price / 100).toFixed(2)} ${
    v0.compare_at_price ? `$${(v0.compare_at_price / 100).toFixed(2)}` : ''
  } ${colors.map((c) => `--swatch-bg: ${c.startsWith('Oxblood') ? '#4A0F1B' : '#000000'}; data-swatch="${c}"`).join(' ')}`;
  cards.set(handle, fake);
}
const handles = [...cards.keys()];

interface SeedProduct {
  handle: string;
  title: string;
  description: string;
  productType: string;
  materials: string[];
  tags: string[];
  priceCents: number;
  compareAtCents: number | null;
  featuredRank: number | null;
  collections: string[];
  colors: { name: string; hex: string }[];
  variants: { sku: string; color: string; size: string; initialStock: number }[];
  images: { file: string; alt: string; color: string }[];
}

const VIEW_ORDER = ['full-model', 'front-product', 'side-model', 'back-product', 'back-model', 'detail'];
const products: SeedProduct[] = [];
let rank = 1;

for (const handle of handles) {
  const card = cards.get(handle)!;
  const rawTitle = /product-card-info__link[^>]*>([\s\S]*?)<\/a>/.exec(card)?.[1] ?? handle;
  const title = decode(rawTitle.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  const amounts = [...card.matchAll(/\$([\d,]+\.\d\d)/g)].map((m) => m[1]!);
  const sale = amounts[0] ? [null, amounts[0]] : null;
  const compare = amounts[1] && cents(amounts[1]) > cents(amounts[0]!) ? [null, amounts[1]] : null;
  const colors = [...card.matchAll(/--swatch-bg: (#[0-9A-Fa-f]{6})[^>]*data-swatch="([^"]+)"/g)].map((m) => ({ name: decode(m[2]!), hex: m[1]! }));
  const uniqueColors = colors.filter((c, i) => colors.findIndex((x) => x.name === c.name) === i);
  if (uniqueColors.length === 0) uniqueColors.push({ name: 'Obsidian Black', hex: '#000000' });

  const images: SeedProduct['images'] = [];
  for (const color of uniqueColors) {
    const prefix = `${handle}-${slug(color.name)}-`;
    const bases = [...filesByBase.keys()].filter((b) => b.startsWith(prefix));
    bases.sort((a, b) => rankView(a.slice(prefix.length)) - rankView(b.slice(prefix.length)));
    for (const base of bases) {
      const view = base.slice(prefix.length).replace(/-/g, ' ');
      images.push({ file: `${base}.webp`, alt: `${title} - ${color.name} - ${view}`, color: color.name });
    }
  }
  if (images.length === 0) {
    console.warn(`(sin imágenes, se omite) ${handle}`);
    continue;
  }

  const { type, materials, collections } = classify(handle, title);
  const priceCents = sale ? cents(sale[1]!) : 25_000;
  const compareCents = compare ? cents(compare[1]!) : null;
  const colorsWithImages = uniqueColors.filter((c) => images.some((i) => i.color === c.name));
  products.push({
    handle,
    title,
    description: `${DESCRIPTION[type]} Available in ${colorsWithImages.map((c) => c.name).join(' and ')}.`,
    productType: type,
    materials,
    tags: [type.toLowerCase(), ...materials.map((m) => m.toLowerCase())],
    priceCents,
    compareAtCents: compareCents && compareCents > priceCents ? compareCents : null,
    featuredRank: rank <= 12 ? rank : null,
    collections,
    colors: colorsWithImages,
    variants: colorsWithImages.flatMap((c, ci) =>
      SIZES.map((size, si) => ({
        sku: `${handle.toUpperCase()}-${c.name.split(' ').map((w) => w.slice(0, 2)).join('').toUpperCase()}-${size}`,
        color: c.name,
        size,
        // Stock determinístico y variado (algunos talles agotados para la demo).
        initialStock: (handle.length + ci * 3 + si * 5) % 9 === 0 ? 0 : ((handle.length * 7 + ci * 11 + si * 13) % 18) + 2,
      })),
    ),
    images,
  });
  rank += 1;
}

function rankView(view: string): number {
  const i = VIEW_ORDER.findIndex((v) => view.startsWith(v));
  return i === -1 ? VIEW_ORDER.length : i;
}

const COLLECTIONS = [
  ['tops', 'Tops', 'Elevated essentials and sharp layers.'],
  ['bottoms', 'Bottoms', 'Trousers, culottes and skirts with clean lines.'],
  ['dresses', 'Dresses', 'Fluid forms, redefined.'],
  ['footwear', 'Footwear', 'Boots and loafers built for the city.'],
  ['outerwear', 'Outerwear', 'The art of everyday layers.'],
  ['blazers', 'Blazers', 'Tailoring, reconsidered.'],
  ['knitwear', 'Knitwear', 'Soft structure in dense knits.'],
  ['accessories', 'Accessories', 'Finishing pieces.'],
  ['leathers', 'Leathers', 'Leather and heavy cotton that wear in, not out.'],
  ['cotton', 'Cotton', 'Breathable everyday pieces.'],
] as const;

const collections = COLLECTIONS.map(([handle, title, description]) => ({
  handle,
  title,
  description,
  products: products.filter((p) => p.collections.includes(handle)).map((p) => p.handle),
})).filter((c) => c.products.length > 0);

mkdirSync(path.join(outDir, 'images'), { recursive: true });
let written = 0;
for (const p of products) {
  for (const img of p.images) {
    const base = img.file.replace(/\.webp$/, '');
    const target = path.join(outDir, 'images', img.file);
    if (existsSync(target)) continue;
    await sharp(filesByBase.get(base)!).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toFile(target);
    written += 1;
  }
}

writeFileSync(path.join(outDir, 'catalog.json'), JSON.stringify({ source: 'radian-rmytbh87.myshopify.com', products, collections }, null, 2) + '\n');
console.log(`${products.length} productos, ${collections.length} colecciones, ${products.reduce((n, p) => n + p.images.length, 0)} imágenes (${written} nuevas) → ${outDir}`);
