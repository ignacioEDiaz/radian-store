import type { CartView, ProductCard, ProductDetail, Suggestions } from '@radian/contracts';
import { ApiError } from '../shared/api/httpClient';
import { formatMoney } from '../shared/format/money';
import { toAjaxCart, toAjaxItem } from './ajaxCart';
import { esc, renderCartDrawerSection, type DrawerShell } from './cartDrawerSection';
import { isVariantUuid, lookupShopifyVariant, pickVariant, rawId } from './variants';

/**
 * "Backend" que ve el JavaScript del tema. El tema fue escrito para hablar con Shopify
 * (`/cart/add`, `/cart/change`, `/search/suggest`…); acá esas llamadas se responden con los datos
 * de nuestra API a través de la capa de services, en el formato que el tema espera. Así el tema
 * queda intacto y toda la lógica de negocio sigue estando en el backend propio.
 */
export interface ThemeBackendDeps {
  cart: {
    get(): Promise<CartView>;
    add(variantId: string, quantity: number): Promise<CartView>;
    update(lineId: string, quantity: number): Promise<CartView>;
    remove(lineId: string): Promise<CartView>;
  };
  getProduct(slug: string): Promise<ProductDetail>;
  suggestions(q: string): Promise<Suggestions>;
  /** Datos del drawer original que se conservan al re-renderizar (id de sección, estilos). */
  drawerShell(): DrawerShell | null;
  /** Se llama con cada carrito confirmado por el servidor (lo usa la caché de React Query). */
  onCart(cart: CartView): void;
}

export interface ThemeRequest {
  method: string;
  url: URL;
  /** Cuerpo ya parseado (JSON u objeto plano de un FormData). */
  body: Record<string, unknown>;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const html = (markup: string) => new Response(markup, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

/** Error con el formato de la API Ajax de Shopify: el tema muestra `description` al usuario. */
const cartError = (description: string, status = 422) => json({ status, message: 'Cart Error', description }, status);

const CART_ROUTE = /^\/cart(?:\/(add|change|update|clear))?(?:\.js)?$/;
const toQuantity = (value: unknown, fallback: number) => {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
};

function priceBlock(p: ProductCard): string {
  if (p.compareAtCents && p.compareAtCents > p.priceCents) {
    return `<div class="price-block price-block--product-grid" data-on-sale><span class="price-block__sale"><span class="visually-hidden">Precio de oferta: </span>${esc(formatMoney(p.priceCents))}</span><span class="price-block__compare"><span class="visually-hidden">Precio regular: ${esc(formatMoney(p.compareAtCents))}</span><s aria-hidden="true">${esc(formatMoney(p.compareAtCents))}</s></span></div>`;
  }
  return `<div class="price-block price-block--product-grid"><span class="price-block__regular"><span class="visually-hidden">Precio regular: </span>${esc(formatMoney(p.priceCents))}</span></div>`;
}

/** Resultados de búsqueda predictiva con el markup de la lista de productos del buscador del tema. */
export function renderPredictiveResults(q: string, s: Suggestions): string {
  const searchUrl = `/search?q=${encodeURIComponent(q)}`;
  const products = s.products
    .map(
      (p) => `<li><a class="search-product" role="option" href="/products/${encodeURIComponent(p.slug)}">
<span class="search-product__media">${p.image ? `<img alt="" loading="lazy" width="${p.image.width}" height="${p.image.height}" sizes="(min-width: 768px) 280px, 50vw" src="${esc(p.image.url)}" srcset="${esc(p.image.srcset.map((i) => `${i.url} ${i.width}w`).join(', '))}"/>` : ''}</span>
<span class="search-product__info"><span class="search-product__title" data-ps-title>${esc(p.title)}</span><span class="search-product__price">${priceBlock(p)}</span></span>
</a></li>`,
    )
    .join('');
  const collections = s.collections
    .map((c) => `<li><a class="search-list__link" role="option" href="/collections/${encodeURIComponent(c.slug)}"><span data-ps-title>${esc(c.title)}</span></a></li>`)
    .join('');
  const total = s.products.length + s.collections.length;
  const status = total === 0 ? `Sin resultados para “${q}”` : `${total} ${total === 1 ? 'resultado' : 'resultados'} para “${q}”`;
  return `<div data-ps-results data-filter="all">
<p class="visually-hidden" data-ps-status-text>${esc(status)}</p>
${collections ? `<div class="search-block"><p class="search-block__title">Colecciones</p><ul class="search-list" role="list">${collections}</ul></div>` : ''}
<div class="search-block search-block--products"><div class="search-block__head"><p class="search-block__title">${products ? 'Productos' : esc(status)}</p>${
    products ? `<a class="search-block__action" data-ps-submit-term="${esc(q)}" href="${esc(searchUrl)}">Ver todos los resultados</a>` : ''
  }</div>
${products ? `<ul class="search-products" role="list">${products}</ul>` : '<p><a class="search-list__link" href="/collections/all">Ver todos los productos</a></p>'}</div>
</div>`;
}

/** Mismo contenido en el formato JSON de `/search/suggest.json` (lo usa el buscador del header). */
export function toPredictiveJson(s: Suggestions) {
  return {
    resources: {
      results: {
        queries: [],
        pages: [],
        articles: [],
        collections: s.collections.map((c) => ({ id: c.id, handle: c.slug, title: c.title, url: `/collections/${c.slug}`, featured_image: { url: c.image?.url ?? null } })),
        products: s.products.map((p) => ({
          id: p.id,
          handle: p.slug,
          title: p.title,
          url: `/products/${p.slug}`,
          type: p.productType,
          vendor: '',
          available: p.available,
          price: (p.priceCents / 100).toFixed(2),
          compare_at_price_max: ((p.compareAtCents ?? 0) / 100).toFixed(2),
          image: p.image?.url ?? null,
          featured_image: { url: p.image?.url ?? null, alt: p.image?.alt ?? p.title, width: p.image?.width ?? 0, height: p.image?.height ?? 0 },
        })),
      },
    },
  };
}

export function createThemeBackend(deps: ThemeBackendDeps) {
  const sectionId = () => deps.drawerShell()?.sectionId ?? '';

  function sectionsFor(requested: unknown, cart: CartView): Record<string, string> | undefined {
    const shell = deps.drawerShell();
    const ids = String(requested ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!shell || !ids.includes(shell.sectionId)) return undefined;
    return { [shell.sectionId]: renderCartDrawerSection(cart, shell) };
  }

  function cartResponse(cart: CartView, body: Record<string, unknown>, extra: Record<string, unknown> = {}): Response {
    deps.onCart(cart);
    const sections = sectionsFor(body['sections'], cart);
    return json({ ...toAjaxCart(cart), ...extra, ...(sections ? { sections } : {}) });
  }

  /** Variante real para un id del tema. `soldOut` trae el nombre si ya se sabe que no tiene stock. */
  async function resolveVariant(id: unknown): Promise<{ variantId: string; soldOut?: string } | null> {
    const raw = rawId(id);
    if (isVariantUuid(raw)) return { variantId: raw };
    const ref = lookupShopifyVariant(raw);
    if (!ref) return null;
    try {
      const product = await deps.getProduct(ref.handle);
      const variant = pickVariant(product, ref);
      if (!variant) return null;
      return variant.available ? { variantId: variant.id } : { variantId: variant.id, soldOut: `${product.title} (${variant.color}, talle ${variant.size})` };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }

  async function add(body: Record<string, unknown>): Promise<Response> {
    const requested = Array.isArray(body['items']) ? (body['items'] as Record<string, unknown>[]) : [body];
    const resolved: { variantId: string; quantity: number }[] = [];
    for (const item of requested) {
      const variant = await resolveVariant(item['id']);
      if (!variant) return cartError('Este producto no está disponible en este momento.');
      // Se valida todo antes de agregar: un conjunto no debe quedar cargado a medias.
      if (variant.soldOut) return cartError(`${variant.soldOut} no tiene stock en este momento.`);
      resolved.push({ variantId: variant.variantId, quantity: Math.max(1, toQuantity(item['quantity'], 1)) });
    }
    let cart: CartView | null = null;
    for (const item of resolved) cart = await deps.cart.add(item.variantId, item.quantity);
    if (!cart) return cartError('No se pudo agregar el producto al carrito.');
    const added = cart.lines.filter((l) => resolved.some((r) => r.variantId === l.variantId)).map(toAjaxItem);
    return cartResponse(cart, body, Array.isArray(body['items']) ? { items: toAjaxCart(cart).items, added } : { added });
  }

  async function setQuantity(lineId: string, quantity: number): Promise<CartView> {
    return quantity <= 0 ? deps.cart.remove(lineId) : deps.cart.update(lineId, quantity);
  }

  async function change(body: Record<string, unknown>): Promise<Response> {
    const lineId = String(body['id'] ?? '');
    if (!lineId) return cartError('No encontramos ese producto en tu carrito.', 404);
    return cartResponse(await setQuantity(lineId, toQuantity(body['quantity'], 0)), body);
  }

  async function update(body: Record<string, unknown>): Promise<Response> {
    const updates = body['updates'] && typeof body['updates'] === 'object' ? (body['updates'] as Record<string, unknown>) : {};
    let cart: CartView | null = null;
    for (const [lineId, quantity] of Object.entries(updates)) cart = await setQuantity(lineId, toQuantity(quantity, 0));
    return cartResponse(cart ?? (await deps.cart.get()), body);
  }

  async function clear(body: Record<string, unknown>): Promise<Response> {
    let cart = await deps.cart.get();
    for (const line of [...cart.lines]) cart = await deps.cart.remove(line.lineId);
    return cartResponse(cart, body);
  }

  async function cartRoute(action: string | undefined, req: ThemeRequest): Promise<Response> {
    try {
      if (req.method === 'GET' && !action) return cartResponse(await deps.cart.get(), {});
      if (req.method !== 'POST') return cartError('Método no permitido.', 405);
      if (action === 'add') return await add(req.body);
      if (action === 'change') return await change(req.body);
      if (action === 'update') return await update(req.body);
      if (action === 'clear') return await clear(req.body);
      return cartError('Operación de carrito desconocida.', 404);
    } catch (err) {
      if (err instanceof ApiError) return cartError(err.message, err.status >= 400 && err.status < 500 ? 422 : 503);
      throw err;
    }
  }

  async function suggest(req: ThemeRequest): Promise<Response> {
    const q = (req.url.searchParams.get('q') ?? '').trim();
    const empty: Suggestions = { products: [], collections: [] };
    const results = q.length >= 2 ? await deps.suggestions(q).catch(() => empty) : empty;
    return req.url.pathname.endsWith('.json') ? json(toPredictiveJson(results)) : html(renderPredictiveResults(q, results));
  }

  /**
   * Devuelve la respuesta si el pedido es uno de los que el tema le hace a Shopify, o `null`
   * para que siga su curso normal (API propia, archivos estáticos).
   */
  function handle(req: ThemeRequest): Promise<Response> | null {
    const { pathname, searchParams } = req.url;
    const cart = CART_ROUTE.exec(pathname);
    // `/cart` a secas con GET es la navegación a la página del carrito, no la API.
    if (cart && (cart[1] || pathname.endsWith('.js'))) return cartRoute(cart[1], req);

    if (req.method !== 'GET') return null;
    if (/^\/search\/suggest(\.json)?$/.test(pathname)) return suggest(req);
    if (pathname.startsWith('/recommendations/')) return Promise.resolve(html(''));

    const section = searchParams.get('section_id');
    if (section && section === sectionId()) {
      return deps.cart.get().then((c) => {
        deps.onCart(c);
        const shell = deps.drawerShell();
        return html(shell ? renderCartDrawerSection(c, shell) : '');
      });
    }
    return null;
  }

  return { handle, renderDrawer: (cart: CartView) => sectionsFor(sectionId(), cart) };
}

export type ThemeBackend = ReturnType<typeof createThemeBackend>;
