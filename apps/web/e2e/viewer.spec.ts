import { expect, test } from '@playwright/test';
import { buyFirstAvailableProduct, shot } from './helpers';

test('cuenta demo de solo lectura: recorre el panel y no puede modificar', async ({ page }) => {
  // Un pedido real de un cliente, para comprobar que la cuenta demo no ve sus datos personales.
  const buyer = await buyFirstAvailableProduct(page);

  await page.goto('/cuenta/ingresar');
  await page.getByRole('button', { name: /usar cuenta demo/i }).click();
  await page.getByRole('button', { name: /^ingresar$/i }).click();
  await expect(page.getByRole('heading', { name: /mi cuenta/i })).toBeVisible();
  // El panel se alcanza desde Mi cuenta (el header es el del tema original).
  await page.getByRole('link', { name: /panel de administración/i }).click();

  await expect(page.getByRole('note')).toContainText(/modo solo lectura/i);
  await expect(page.getByRole('row').nth(1)).toBeVisible();
  await page.getByRole('row').nth(1).getByRole('link').click();
  await expect(page.getByRole('heading', { name: /variantes y stock/i })).toBeVisible();

  await page.getByRole('button', { name: /guardar datos/i }).click();
  const dialog = page.getByRole('alertdialog', { name: /cuenta de solo lectura/i });
  await expect(dialog).toContainText(/no crear, editar ni borrar/i);
  await shot(page, '09-read-only');
  await dialog.getByRole('button', { name: /entendido/i }).click();
  await expect(dialog).toBeHidden();

  await page.goto('/admin/pedidos');
  await expect(page.getByRole('heading', { name: 'Pedidos' })).toBeVisible();
  const orders = page.locator('#root');
  await expect(orders.getByText(/@/).first()).toContainText('***@');
  await expect(orders.getByText(buyer)).toHaveCount(0);
});
