import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env['E2E_SCREENSHOTS'];

/** Captura para la documentación (solo si se pide con E2E_SCREENSHOTS=<carpeta>). */
export async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: false });
}

/** Drawer de carrito del tema original (lo abre y anima su propio JavaScript). */
export const cartDrawer = (page: Page) => page.locator('#cart-drawer');
/** Contador de la bolsa en el header del tema. */
export const cartCount = (page: Page) => page.locator('[data-cart-count-value]').first();

/**
 * Compra completa como invitado: catálogo → producto → carrito (drawer del tema) → checkout →
 * confirmación. Devuelve el email usado.
 */
export async function buyFirstAvailableProduct(page: Page, capture = false): Promise<string> {
  const snap = (name: string) => (capture ? shot(page, name) : Promise.resolve());
  await page.goto('/collections/all?available=true');
  await expect(page.getByRole('heading', { level: 1, name: 'Productos' })).toBeVisible();
  await expect(page.getByText(/mostrando \d+ de \d+/i)).toBeVisible();
  await snap('03-collection');
  await page.locator('#productsGrid .product-card-info__link').first().click();

  await expect(page.locator('h1.product-title')).toBeVisible();
  await expect(page.getByRole('button', { name: /^talle/i }).first()).toBeVisible();
  await snap('04-product');
  await page.getByRole('button', { name: /agregar al carrito/i }).click();

  const drawer = cartDrawer(page);
  await expect(drawer).toHaveAttribute('aria-hidden', 'false');
  await expect(drawer.locator('.cart-item')).toHaveCount(1);
  await expect(cartCount(page)).toHaveText('1');
  await snap('05-cart');
  await drawer.getByRole('button', { name: /finalizar compra/i }).click();

  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  // El footer del tema también tiene un campo "Email" (newsletter): se acota a la aplicación.
  const form = page.locator('#root');
  const email = `e2e-${Date.now()}-${test.info().project.name}@example.com`;
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Destinatario').fill('Ana Pérez');
  await form.getByLabel('Dirección', { exact: true }).fill('Av. Corrientes 1234');
  await form.getByLabel('Ciudad').fill('CABA');
  await form.getByLabel(/provincia/i).fill('CABA');
  await form.getByLabel(/código postal/i).fill('1043');
  await form.getByLabel(/país/i).fill('AR');
  await form.getByLabel(/teléfono/i).fill('+54 11 5555 5555');
  await form.getByLabel(/número de tarjeta/i).fill('4242 4242 4242 4242');
  await form.getByLabel(/vencimiento/i).fill('12/30');
  await form.getByLabel('CVC').fill('123');
  await form.getByLabel('Titular').fill('Ana Pérez');
  await snap('06-checkout');
  await page.getByRole('button', { name: /^pagar/i }).click();

  await expect(page.getByRole('heading', { name: /gracias por tu compra/i })).toBeVisible();
  await expect(page.getByText(/RS-\d{6}/).first()).toBeVisible();
  await snap('07-confirmation');
  return email;
}
