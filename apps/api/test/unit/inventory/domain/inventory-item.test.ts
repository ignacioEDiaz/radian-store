import { describe, expect, it } from 'vitest';
import { InventoryItem } from '../../../../src/modules/inventory/domain/inventory-item.js';
import { MediaAsset } from '../../../../src/modules/media/domain/media-asset.js';

const now = new Date('2026-11-10T12:00:00Z');

describe('InventoryItem', () => {
  const item = (onHand = 5) => InventoryItem.create({ variantId: crypto.randomUUID(), productId: crypto.randomUUID(), sku: 'A-1', onHand, now });

  it('se crea con stock inicial ≥ 0', () => {
    expect(item(3).toSnapshot()).toMatchObject({ onHand: 3, reserved: 0, available: 3 });
    expect(() => item(-1)).toThrow(expect.objectContaining({ code: 'NEGATIVE_STOCK' }));
  });

  it('ajusta stock registrando motivo y rechaza dejarlo negativo', () => {
    const i = item(5);
    i.pullEvents();
    i.adjust({ delta: -2, reason: 'damage', actorId: null }, now);
    expect(i.toSnapshot().onHand).toBe(3);
    expect(i.pullEvents()[0]).toMatchObject({ type: 'inventory.StockAdjusted', payload: { delta: -2, reason: 'damage', onHand: 3, reserved: 0 } });
    expect(() => i.adjust({ delta: -4, reason: 'correction', actorId: null }, now)).toThrow(expect.objectContaining({ code: 'NEGATIVE_STOCK' }));
    expect(() => i.adjust({ delta: 0, reason: 'correction', actorId: null }, now)).toThrow();
  });

  it('no permite bajar el físico por debajo de lo reservado', () => {
    const i = InventoryItem.rehydrate({ variantId: 'v', productId: 'p', sku: 'A', onHand: 5, reserved: 4, version: 3 });
    expect(() => i.adjust({ delta: -2, reason: 'correction', actorId: null }, now)).toThrow(expect.objectContaining({ code: 'NEGATIVE_STOCK' }));
  });
});

describe('MediaAsset', () => {
  it('expone la URL por ancho y valida anchos', () => {
    const m = MediaAsset.create({ id: 'm1', sha256: 'a'.repeat(64), mimeType: 'image/png', width: 1000, height: 1300, bytes: 10, widths: [320, 640, 960], now });
    expect(m.url(640)).toBe('/media/m1/640.webp');
    expect(m.defaultUrl()).toBe('/media/m1/960.webp');
    expect(() => MediaAsset.create({ id: 'm2', sha256: 'b'.repeat(64), mimeType: 'image/png', width: 1, height: 1, bytes: 1, widths: [], now })).toThrow();
  });
});
