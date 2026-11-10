import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fullApp, resetAll } from '../../support/full-app.js';
import { seedCatalog } from '../../support/catalog-seed.js';
import { PgStockReservations } from '../../../src/modules/inventory/infrastructure/pg-stock-reservations.js';
import { systemClock } from '../../../src/shared/application/ports.js';

let ctx: Awaited<ReturnType<typeof fullApp>>;
let a: string;
let b: string;
let last: string;

beforeAll(async () => {
  ctx = await fullApp();
});
afterAll(() => ctx.close());

beforeEach(async () => {
  await resetAll(ctx.infra);
  const { products } = await seedCatalog(ctx.infra, ctx.mediaDir, [
    { title: 'Alpha', variants: [{ color: 'Black', size: 'S', stock: 100 }] },
    { title: 'Beta', variants: [{ color: 'Black', size: 'M', stock: 100 }] },
    { title: 'Last One', variants: [{ color: 'Black', size: 'L', stock: 1 }] },
  ]);
  [a, b, last] = products.map((p) => p.variants[0]!.id) as [string, string, string];
});

const stock = async (variantId: string) =>
  (await ctx.infra.writeDb.query<{ on_hand: number; reserved: number }>('SELECT on_hand, reserved FROM inventory_items WHERE variant_id = $1', [variantId])).rows[0]!;

const inTx = <T>(fn: (r: PgStockReservations) => Promise<T>) => ctx.infra.writeDb.withTransaction((tx) => fn(new PgStockReservations(tx, systemClock)));
const expires = () => new Date(Date.now() + 15 * 60_000);

describe('PgStockReservations', () => {
  it('reserva todo o nada', async () => {
    const order = crypto.randomUUID();
    await expect(
      inTx((r) => r.reserve(order, [{ variantId: a, quantity: 2 }, { variantId: last, quantity: 2 }], expires())),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', meta: { lines: [{ variantId: last, available: 1 }] } });
    expect(await stock(a)).toEqual({ on_hand: 100, reserved: 0 });
  });

  it('commit descuenta el físico; release libera; restock repone', async () => {
    const o1 = crypto.randomUUID();
    await inTx((r) => r.reserve(o1, [{ variantId: a, quantity: 3 }], expires()));
    expect(await stock(a)).toEqual({ on_hand: 100, reserved: 3 });
    await inTx((r) => r.commit(o1));
    expect(await stock(a)).toEqual({ on_hand: 97, reserved: 0 });
    await inTx((r) => r.restock(o1));
    expect(await stock(a)).toEqual({ on_hand: 100, reserved: 0 });

    const o2 = crypto.randomUUID();
    await inTx((r) => r.reserve(o2, [{ variantId: b, quantity: 5 }], expires()));
    await inTx((r) => r.release(o2));
    await inTx((r) => r.release(o2)); // idempotente
    expect(await stock(b)).toEqual({ on_hand: 100, reserved: 0 });
    const events = await ctx.infra.writeDb.query<{ event_type: string }>(`SELECT event_type FROM outbox WHERE event_type LIKE 'inventory.Stock%' ORDER BY id`);
    expect(events.rows.map((e) => e.event_type)).toEqual(['inventory.StockReserved', 'inventory.StockCommitted', 'inventory.StockRestocked', 'inventory.StockReserved', 'inventory.StockReleased']);
  });

  it('50 compras simultáneas de la última unidad: exactamente 1 reserva (sin sobreventa)', async () => {
    const results = await Promise.allSettled(Array.from({ length: 50 }, () => inTx((r) => r.reserve(crypto.randomUUID(), [{ variantId: last, quantity: 1 }], expires()))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected.every((r) => (r.reason as { code?: string }).code === 'INSUFFICIENT_STOCK')).toBe(true);
    expect(await stock(last)).toEqual({ on_hand: 1, reserved: 1 });
  });

  it('pedidos multi-línea cruzados no generan deadlocks (orden fijo por variante)', async () => {
    const runs = Array.from({ length: 30 }, (_, i) =>
      inTx((r) => r.reserve(crypto.randomUUID(), i % 2 ? [{ variantId: a, quantity: 1 }, { variantId: b, quantity: 1 }] : [{ variantId: b, quantity: 1 }, { variantId: a, quantity: 1 }], expires())),
    );
    const results = await Promise.allSettled(runs);
    expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
    expect(await stock(a)).toEqual({ on_hand: 100, reserved: 30 });
  });
});
