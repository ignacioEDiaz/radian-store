import { expect, test } from '@playwright/test';
import { buyFirstAvailableProduct, cartCount, cartDrawer, shot } from './helpers';

test('la home es el tema original: secciones, estilos y scripts intactos, sin errores', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const missing: string[] = [];
  page.on('response', (r) => {
    const { pathname } = new URL(r.url());
    if (r.status() >= 400 && /^\/(cdn|_hosts|assets)\//.test(pathname)) missing.push(pathname);
  });

  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/template-index/);
  // Las 25 secciones de la portada original, en su orden.
  const sections = await page.locator('main [id^="shopify-section-template--"]').evaluateAll((els) => els.map((e) => e.id.replace(/^.*__/, '')));
  expect(sections).toHaveLength(25);
  expect(sections.slice(0, 4)).toEqual(['hero_product_hotspots_G6JgYb', 'word_bloom', 'image_gallery_MEhnBR', 'promo_tiles_offer']);
  await expect(page.locator('.hero-product-hotspots')).toBeVisible();
  await expect(page.locator('#mainNav .ig-logo').first()).toBeVisible();
  // El JavaScript del tema corrió (animaciones, scroll suave, menús).
  expect(await page.evaluate(() => typeof (window as unknown as { Axiom?: { initAnimations?: unknown } }).Axiom?.initAnimations)).toBe('function');
  await expect(page.locator('html')).toHaveClass(/\bjs\b/);
  await shot(page, '01-home');

  const footer = page.locator('footer.footer-group-shell');
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeVisible();
  expect(errors).toEqual([]);
  // El clon original ya pedía este archivo con la URL mal formada (en pantallas chicas); no es
  // un archivo que se haya perdido al integrarlo.
  const brokenInOriginal = ['/cdn/shop/files/radian-story-boots-steps__35b66f2da3.webp0'];
  expect(missing.filter((path) => !brokenInOriginal.includes(path))).toEqual([]);
});

test('desde la home original: "agregar todo al carrito" guarda el look en el backend', async ({ page, isMobile }) => {
  test.skip(isMobile, 'el panel del look se abre desde los hotspots del hero en escritorio');
  await page.goto('/');
  await page.getByRole('button', { name: /agregar todo al carrito/i }).first().click();
  await page.getByRole('button', { name: /agregar todo al carrito/i }).last().click();

  const drawer = cartDrawer(page);
  await expect(drawer).toHaveAttribute('aria-hidden', 'false');
  await expect(drawer.locator('.cart-item')).toHaveCount(2);
  await expect(drawer.locator('.cart-item__title')).toHaveText(['Sable Blazer', 'Sable Trousers']);
  await expect(drawer.locator('.cart-subtotal__price')).toHaveText('US$ 570,00');
  await expect(cartCount(page)).toHaveText('2');
  await shot(page, '02-home-cart');

  // El carrito vive en el servidor: sobrevive a recargar y se ve desde cualquier página.
  await page.reload();
  await expect(cartCount(page)).toHaveText('2');
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: /tu bolsa/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sable Trousers' })).toBeVisible();

  await page.getByRole('button', { name: /quitar sable trousers/i }).click();
  await expect(page.getByRole('link', { name: 'Sable Trousers' })).toBeHidden();
  await expect(cartCount(page)).toHaveText('1');
});

test('compra completa como invitado: catálogo → producto → carrito → checkout → confirmación', async ({ page }) => {
  await buyFirstAvailableProduct(page, true);
  // Pedido pagado ⇒ carrito vacío también en el header del tema.
  await expect(cartCount(page)).toHaveText('0', { timeout: 10_000 });
});

test('el buscador del tema consulta el catálogo del backend', async ({ page, isMobile }) => {
  test.skip(isMobile, 'en pantallas chicas el buscador se abre desde el menú');
  await page.goto('/collections/all');
  await page.locator('#mainNav [data-open-search], #mainNav [aria-controls="SearchDrawer"]').first().click();
  await page.locator('#SearchDrawerInput').fill('boot');
  const results = page.locator('#SearchDrawerResults .search-product');
  await expect(results.first()).toBeVisible();
  await expect(page.locator('#SearchDrawerResults')).toContainText('Sharp Leather Boot');
  await page.locator('#SearchDrawerInput').press('Enter');
  await expect(page).toHaveURL(/\/search\?q=boot/);
  await expect(page.getByRole('heading', { level: 1, name: /resultados para “boot”/i })).toBeVisible();
});

test('estado del sistema visible para operadores', async ({ page }) => {
  await page.goto('/estado');
  await expect(page.getByText(/operativo/i, { exact: false }).first()).toBeVisible();
  await shot(page, '08-status');
});
