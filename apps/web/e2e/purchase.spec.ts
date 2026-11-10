import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env['E2E_SCREENSHOTS'];

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: false });
}

test('compra completa como invitado: portada → producto → carrito → checkout → confirmación', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: /novedades/i }).getByRole('article').first()).toBeVisible();
  await shot(page, '01-home');

  await page.goto('/tienda?available=true');
  await expect(page.getByText(/\d+ productos/)).toBeVisible();
  await shot(page, '02-shop');
  await page.getByRole('article').first().getByRole('link').last().click();

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const size = page.locator('input[name="size"]:not([disabled])').first();
  await size.check({ force: true });
  await shot(page, '03-product');
  await page.getByRole('button', { name: /agregar al carrito/i }).click();

  const drawer = page.getByRole('dialog', { name: /tu carrito/i });
  await expect(drawer).toBeVisible();
  await expect(page.getByRole('button', { name: /carrito, 1 producto/i })).toBeVisible();
  await shot(page, '04-cart');
  await drawer.getByRole('link', { name: /finalizar compra/i }).click();

  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await page.getByLabel('Email').fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel('Destinatario').fill('Ana Pérez');
  await page.getByLabel('Dirección', { exact: true }).fill('Av. Corrientes 1234');
  await page.getByLabel('Ciudad').fill('CABA');
  await page.getByLabel(/provincia/i).fill('CABA');
  await page.getByLabel(/código postal/i).fill('1043');
  await page.getByLabel(/país/i).fill('AR');
  await page.getByLabel(/teléfono/i).fill('+54 11 5555 5555');
  await page.getByLabel(/número de tarjeta/i).fill('4242 4242 4242 4242');
  await page.getByLabel(/vencimiento/i).fill('12/30');
  await page.getByLabel('CVC').fill('123');
  await page.getByLabel('Titular').fill('Ana Pérez');
  await shot(page, '05-checkout');
  await page.getByRole('button', { name: /^pagar/i }).click();

  await expect(page.getByRole('heading', { name: /gracias por tu compra/i })).toBeVisible();
  await expect(page.getByText(/RS-\d{6}/).first()).toBeVisible();
  await shot(page, '06-confirmation');
  await expect(page.getByRole('button', { name: /carrito, 0 productos/i })).toBeVisible({ timeout: 10_000 });
});

test('estado del sistema visible para operadores', async ({ page }) => {
  await page.goto('/estado');
  await expect(page.getByText(/operativo/i, { exact: false }).first()).toBeVisible();
  await shot(page, '07-status');
});
