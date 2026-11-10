import { expect, test } from '@playwright/test';

const SHOTS = process.env['E2E_SCREENSHOTS'];

test('cuenta demo de solo lectura: recorre el panel y no puede modificar', async ({ page }) => {
  await page.goto('/cuenta/ingresar');
  await page.getByRole('button', { name: /usar cuenta demo/i }).click();
  await page.getByRole('button', { name: /^ingresar$/i }).click();
  await expect(page.getByRole('heading', { name: /mi cuenta/i })).toBeVisible();

  await page.goto('/admin/productos');
  await expect(page.getByRole('note')).toContainText(/modo solo lectura/i);
  await expect(page.getByRole('row').nth(1)).toBeVisible();
  await page.getByRole('row').nth(1).getByRole('link').click();
  await expect(page.getByRole('heading', { name: /variantes y stock/i })).toBeVisible();

  await page.getByRole('button', { name: /guardar datos/i }).click();
  const dialog = page.getByRole('alertdialog', { name: /cuenta de solo lectura/i });
  await expect(dialog).toContainText(/no crear, editar ni borrar/i);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-08-read-only.png` });
  await dialog.getByRole('button', { name: /entendido/i }).click();
  await expect(dialog).toBeHidden();

  await page.goto('/admin/pedidos');
  await expect(page.getByRole('heading', { name: 'Pedidos' })).toBeVisible();
  await expect(page.getByText(/@/).first()).toContainText('***@');
});
