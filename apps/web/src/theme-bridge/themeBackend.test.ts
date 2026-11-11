import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartLineView, CartView, ProductDetail, Suggestions } from '@radian/contracts';
import { ApiError } from '../shared/api/httpClient';
import { createThemeBackend, type ThemeBackendDeps, type ThemeRequest } from './themeBackend';
import type { DrawerShell } from './cartDrawerSection';
import { installFetchBridge } from './fetchBridge';
import { lookupShopifyVariant, pickVariant } from './variants';

const SECTION = 'sections--1__cart-drawer';
const shell: DrawerShell = { sectionId: SECTION, style: '--cart-drawer-width: 520px;', className: 'cart-drawer cart-drawer--fixed-footer', aside: '<aside data-cart-side hidden></aside>' };
const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';

const line = (over: Partial<CartLineView> = {}): CartLineView => ({
  lineId: 'line-1',
  variantId: V1,
  productSlug: 'sable-blazer',
  title: 'Sable Blazer',
  color: 'Obsidian Black',
  size: 'S',
  image: { url: '/media/a/640.webp', srcset: [{ width: 640, url: '/media/a/640.webp' }], alt: 'Sable Blazer', width: 640, height: 857, color: null },
  quantity: 1,
  unitPriceCents: 25_500,
  previousUnitPriceCents: null,
  lineTotalCents: 25_500,
  available: true,
  maxQuantity: 7,
  warnings: [],
  ...over,
});
const cartOf = (...lines: CartLineView[]): CartView => ({
  id: 'cart-1',
  lines,
  itemCount: lines.reduce((n, l) => n + l.quantity, 0),
  subtotalCents: lines.reduce((n, l) => n + l.lineTotalCents, 0),
  currency: 'USD',
});
const product = (variants: ProductDetail['variants']): ProductDetail =>
  ({ id: 'p1', slug: 'sable-blazer', title: 'Sable Blazer', variants }) as unknown as ProductDetail;
const variant = (id: string, color: string, size: string, available = true) => ({ id, sku: `${color}-${size}`, color, size, priceCents: 25_500, available, availableQty: available ? 3 : 0 });

const request = (method: string, path: string, body: Record<string, unknown> = {}): ThemeRequest => ({ method, url: new URL(path, 'http://shop.test'), body });

function setup(over: Partial<ThemeBackendDeps> = {}) {
  const deps: ThemeBackendDeps = {
    cart: {
      get: vi.fn(async () => cartOf()),
      add: vi.fn(async () => cartOf(line())),
      update: vi.fn(async (_id: string, quantity: number) => cartOf(line({ quantity, lineTotalCents: 25_500 * quantity }))),
      remove: vi.fn(async () => cartOf()),
    },
    getProduct: vi.fn(async () => product([variant(V1, 'Obsidian Black', 'S'), variant(V2, 'Obsidian Black', 'M')])),
    suggestions: vi.fn(async (): Promise<Suggestions> => ({ products: [], collections: [] })),
    drawerShell: () => shell,
    onCart: vi.fn(),
    ...over,
  };
  return { deps, backend: createThemeBackend(deps) };
}

/** Un id de variante de Shopify que el tema usa en la home (sale del mapa generado). */
const SABLE_BLAZER_S = '48958947950846';

describe('mapa de variantes del tema', () => {
  it('traduce el id de Shopify al producto, color y talle', () => {
    expect(lookupShopifyVariant(SABLE_BLAZER_S)).toEqual({ handle: 'sable-blazer', color: 'Obsidian Black', size: 'S' });
    expect(lookupShopifyVariant(`gid://shopify/ProductVariant/${SABLE_BLAZER_S}`)?.handle).toBe('sable-blazer');
    expect(lookupShopifyVariant('1')).toBeNull();
  });

  it('elige color y talle exactos; sin talle, el primero con stock', () => {
    const p = product([variant('a', 'Obsidian Black', 'S', false), variant('b', 'Obsidian Black', 'M'), variant('c', 'Oxblood Burgundy', 'S')]);
    expect(pickVariant(p, { color: 'Obsidian Black', size: 'M' })?.id).toBe('b');
    expect(pickVariant(p, { color: 'obsidian black', size: null })?.id).toBe('b');
    expect(pickVariant(p, { color: 'Oxblood Burgundy', size: null })?.id).toBe('c');
    // Talle que no existe para ese color: no se sustituye por otro en silencio.
    expect(pickVariant(p, { color: 'Obsidian Black', size: 'XL' })).toBeNull();
    // Color que nuestro catálogo no tiene: se ofrece el producto en el que sí hay.
    expect(pickVariant(p, { color: 'Bone Ivory', size: 'S' })?.id).toBe('a');
  });
});

describe('backend del tema: carrito', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ignora lo que no es del tema (nuestra API, archivos, la navegación a /cart)', () => {
    const { backend } = setup();
    expect(backend.handle(request('GET', '/api/cart'))).toBeNull();
    expect(backend.handle(request('GET', '/cdn/shop/t/8/assets/global.js'))).toBeNull();
    expect(backend.handle(request('GET', '/cart'))).toBeNull();
    expect(backend.handle(request('POST', '/api/cart/items', { variantId: V1 }))).toBeNull();
  });

  it('POST /cart/add con un id de Shopify agrega la variante real y devuelve la sección del drawer', async () => {
    const { backend, deps } = setup();
    const res = await backend.handle(request('POST', '/cart/add', { items: [{ id: SABLE_BLAZER_S, quantity: 2 }], sections: SECTION, sections_url: '/' }))!;
    expect(res.status).toBe(200);
    expect(deps.getProduct).toHaveBeenCalledWith('sable-blazer');
    expect(deps.cart.add).toHaveBeenCalledWith(V1, 2);

    const body = (await res.json()) as { item_count: number; items: { key: string }[]; sections: Record<string, string> };
    expect(body.item_count).toBe(1);
    const section = new DOMParser().parseFromString(body.sections[SECTION]!, 'text/html');
    const drawer = section.getElementById('cart-drawer')!;
    expect(drawer.dataset['sectionId']).toBe(SECTION);
    expect(JSON.parse(drawer.querySelector('[data-cart-state]')!.textContent).items[0].key).toBe('line-1');
    expect(deps.onCart).toHaveBeenCalledWith(expect.objectContaining({ itemCount: 1 }));
  });

  it('acepta el formulario de producto (FormData → id/quantity) y los ids propios (UUID)', async () => {
    const { backend, deps } = setup();
    await backend.handle(request('POST', '/cart/add.js', { id: V2, quantity: '3', sections: SECTION }))!;
    expect(deps.getProduct).not.toHaveBeenCalled();
    expect(deps.cart.add).toHaveBeenCalledWith(V2, 3);
  });

  it('una variante que no existe en el catálogo responde 422 con mensaje para el usuario', async () => {
    const { backend, deps } = setup();
    const res = await backend.handle(request('POST', '/cart/add', { items: [{ id: '999', quantity: 1 }] }))!;
    expect(res.status).toBe(422);
    expect(((await res.json()) as { description: string }).description).toMatch(/no está disponible/i);
    expect(deps.cart.add).not.toHaveBeenCalled();
  });

  it('si una prenda de un conjunto no tiene stock no agrega ninguna (nada de conjuntos a medias)', async () => {
    const { backend, deps } = setup({ getProduct: vi.fn(async () => product([variant(V1, 'Obsidian Black', 'S', false), variant(V2, 'Obsidian Black', 'M')])) });
    const res = await backend.handle(request('POST', '/cart/add', { items: [{ id: V2, quantity: 1 }, { id: SABLE_BLAZER_S, quantity: 1 }] }))!;
    expect(res.status).toBe(422);
    expect(((await res.json()) as { description: string }).description).toBe('Sable Blazer (Obsidian Black, talle S) no tiene stock en este momento.');
    expect(deps.cart.add).not.toHaveBeenCalled();
  });

  it('los rechazos de negocio de la API (sin stock) llegan al tema como error 422 con su mensaje', async () => {
    const { backend } = setup({
      cart: { get: vi.fn(), remove: vi.fn(), update: vi.fn(), add: vi.fn(async () => Promise.reject(new ApiError(409, 'INSUFFICIENT_STOCK', 'No hay stock suficiente'))) },
    });
    const res = await backend.handle(request('POST', '/cart/add', { items: [{ id: V1, quantity: 1 }] }))!;
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ description: 'No hay stock suficiente' });
  });

  it('POST /cart/change actualiza la cantidad y con 0 quita la línea', async () => {
    const { backend, deps } = setup();
    const updated = await backend.handle(request('POST', '/cart/change', { id: 'line-1', quantity: 4, sections: SECTION }))!;
    expect(deps.cart.update).toHaveBeenCalledWith('line-1', 4);
    expect(((await updated.json()) as { item_count: number }).item_count).toBe(4);

    const removed = await backend.handle(request('POST', '/cart/change.js', { id: 'line-1', quantity: 0, sections: SECTION }))!;
    expect(deps.cart.remove).toHaveBeenCalledWith('line-1');
    const body = (await removed.json()) as { item_count: number; sections: Record<string, string> };
    expect(body.item_count).toBe(0);
    expect(body.sections[SECTION]).toContain('Tu carrito está vacío');
  });

  it('POST /cart/update aplica varias líneas y POST /cart/clear vacía el carrito', async () => {
    const two = cartOf(line(), line({ lineId: 'line-2', variantId: V2 }));
    const { backend, deps } = setup({ cart: { get: vi.fn(async () => two), add: vi.fn(), update: vi.fn(async () => two), remove: vi.fn(async () => cartOf()) } });
    await backend.handle(request('POST', '/cart/update', { updates: { 'line-1': 2, 'line-2': 0 } }))!;
    expect(deps.cart.update).toHaveBeenCalledWith('line-1', 2);
    expect(deps.cart.remove).toHaveBeenCalledWith('line-2');

    vi.mocked(deps.cart.remove).mockClear();
    const res = await backend.handle(request('POST', '/cart/clear.js', { sections: SECTION }))!;
    expect(deps.cart.remove).toHaveBeenCalledTimes(2);
    expect(((await res.json()) as { item_count: number }).item_count).toBe(0);
  });

  it('GET /cart.js y ?section_id= devuelven el carrito del backend', async () => {
    const { backend } = setup({ cart: { get: vi.fn(async () => cartOf(line())), add: vi.fn(), update: vi.fn(), remove: vi.fn() } });
    const cart = (await (await backend.handle(request('GET', '/cart.js'))!).json()) as { items: { variant_id: string; price: number }[] };
    expect(cart.items[0]).toMatchObject({ variant_id: V1, price: 25_500 });

    const res = await backend.handle(request('GET', `/?section_id=${SECTION}`))!;
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('Sable Blazer');
    expect(backend.handle(request('GET', '/?section_id=otra-seccion'))).toBeNull();
  });
});

describe('sección del drawer', () => {
  const render = (cart: CartView) => {
    const { backend } = setup();
    return new DOMParser().parseFromString(backend.renderDrawer(cart)![SECTION]!, 'text/html');
  };

  it('usa el markup del tema: ítems con sus hooks de cantidad y totales en el formato de la tienda', () => {
    const doc = render(cartOf(line({ quantity: 2, lineTotalCents: 51_000 })));
    const item = doc.querySelector('.cart-item')!;
    expect(item.getAttribute('data-key')).toBe('line-1');
    expect(item.querySelector('.cart-item__qty-val')!.textContent).toBe('2');
    expect(item.querySelector('[data-cart-quantity-rules]')!.getAttribute('data-max-rule')).toBe('7');
    expect(item.querySelectorAll('.cart-item__qty-btn')).toHaveLength(2);
    expect(item.querySelector('.cart-item__remove')!.getAttribute('data-line')).toBe('1');
    expect(doc.querySelector('.cart-subtotal__price')!.textContent).toBe('US$ 510,00');
    expect(doc.querySelector('[data-cart-drawer-count]')!.textContent).toBe(' (2)');
    expect(doc.querySelector('form[action="/checkout"]')).not.toBeNull();
    expect(doc.querySelector('aside[data-cart-side]')).not.toBeNull();
  });

  it('muestra cuánto falta para el envío gratis según la regla del backend (US$ 150)', () => {
    expect(render(cartOf(line({ unitPriceCents: 10_000, lineTotalCents: 10_000 }))).querySelector('.free-shipping-bar__message')!.textContent).toContain('US$ 50,00');
    const reached = render(cartOf(line()));
    expect(reached.querySelector('.free-shipping-bar__message')!.textContent).toContain('envío gratis');
    expect(reached.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('100');
  });

  it('avisa en la línea cuando el producto quedó sin stock y escapa el contenido', () => {
    const doc = render(cartOf(line({ title: '<img src=x onerror=alert(1)>', warnings: ['OUT_OF_STOCK'], available: false })));
    expect(doc.querySelector('.cart-item__title')!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(doc.querySelector('.cart-item__title img')).toBeNull();
    const error = doc.querySelector('[data-cart-line-error]')!;
    expect(error.hasAttribute('hidden')).toBe(false);
    expect(error.textContent).toMatch(/sin stock/i);
  });

  it('carrito vacío: estado vacío del tema, sin pie de compra', () => {
    const doc = render(cartOf());
    expect(doc.querySelector('.cart-drawer__empty')!.textContent).toContain('Tu carrito está vacío');
    expect(doc.querySelector('.cart-drawer__footer')).toBeNull();
    expect(doc.querySelector('[data-cart-drawer-count]')!.hasAttribute('hidden')).toBe(true);
  });
});

describe('búsqueda predictiva', () => {
  const found: Suggestions = {
    products: [{ id: 'p1', slug: 'sharp-boot', title: 'Sharp Leather Boot', productType: 'Footwear', priceCents: 45_000, compareAtCents: 57_692, image: null, hoverImage: null, colors: [], available: true, isNew: false }],
    collections: [{ id: 'c1', slug: 'footwear', title: 'Footwear', description: '', image: null, productCount: 5 }],
  };

  it('GET /search/suggest devuelve el HTML con el markup del buscador del tema', async () => {
    const { backend, deps } = setup({ suggestions: vi.fn(async () => found) });
    const res = await backend.handle(request('GET', '/search/suggest?q=boot&section_id=predictive-search'))!;
    expect(deps.suggestions).toHaveBeenCalledWith('boot');
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const results = doc.querySelector('[data-ps-results]')!;
    expect(results.querySelector('a.search-product')!.getAttribute('href')).toBe('/products/sharp-boot');
    expect(results.querySelector('[data-ps-title]')!.textContent).toBe('Footwear');
    expect(results.querySelector('.price-block__sale')!.textContent).toContain('US$ 450,00');
    expect(results.querySelectorAll('[role="option"]')).toHaveLength(2);
  });

  it('GET /search/suggest.json devuelve el formato JSON; con menos de 2 letras no consulta', async () => {
    const { backend, deps } = setup({ suggestions: vi.fn(async () => found) });
    const body = (await (await backend.handle(request('GET', '/search/suggest.json?q=boot'))!).json()) as { resources: { results: { products: { url: string }[] } } };
    expect(body.resources.results.products[0]!.url).toBe('/products/sharp-boot');
    await backend.handle(request('GET', '/search/suggest?q=b'))!;
    expect(deps.suggestions).toHaveBeenCalledTimes(1);
  });
});

describe('puente de fetch', () => {
  it('responde los pedidos del tema y deja pasar el resto al fetch real', async () => {
    const native = vi.fn(async () => new Response('real'));
    const target = { fetch: native as unknown as typeof fetch, location: { origin: 'http://shop.test' } };
    const { backend, deps } = setup();
    const restore = installFetchBridge(backend, target);

    const body = new FormData();
    body.set('id', V1);
    body.set('quantity', '2');
    const res = await target.fetch('/cart/add', { method: 'POST', body });
    expect(res.status).toBe(200);
    expect(deps.cart.add).toHaveBeenCalledWith(V1, 2);
    expect(native).not.toHaveBeenCalled();

    await target.fetch('/cart/change', { method: 'POST', body: JSON.stringify({ id: 'line-1', quantity: 5 }) });
    expect(deps.cart.update).toHaveBeenCalledWith('line-1', 5);

    expect(await (await target.fetch('/api/cart')).text()).toBe('real');
    await target.fetch('https://otro.sitio/cart/add', { method: 'POST' });
    expect(native).toHaveBeenCalledTimes(2);

    restore();
    expect(target.fetch).not.toBe(undefined);
    await target.fetch('/cart.js');
    expect(native).toHaveBeenCalledTimes(3);
  });
});
