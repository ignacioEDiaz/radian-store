import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import { DomainError, NotFoundError } from '../../../shared/domain/errors.js';

export const MAX_LINE_QUANTITY = 10;
export const MAX_LINES = 50;

/** Datos de disponibilidad de una variante (los provee el puerto CatalogAvailability). */
export interface AvailableVariant {
  variantId: string;
  productId: string;
  priceCents: number;
  published: boolean;
  /** Unidades disponibles (físico − reservado). */
  available: number;
}

export interface CartLine {
  id: string;
  variantId: string;
  productId: string;
  quantity: number;
  /** Precio al agregar: permite avisar si cambió. */
  unitPriceCents: number;
}

export interface CartSnapshot {
  id: string;
  customerId: string | null;
  lines: CartLine[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

type E<T extends string> = DomainEvent<T, { snapshot: CartSnapshot }>;
export type CartEvent =
  | E<'cart.CartCreated'>
  | E<'cart.CartItemAdded'>
  | E<'cart.CartLineQuantityChanged'>
  | E<'cart.CartLineRemoved'>
  | E<'cart.CartCleared'>
  | E<'cart.CartsMerged'>
  | E<'cart.CartExpired'>;
export const CART_EVENT_TYPES: CartEvent['type'][] = [
  'cart.CartCreated',
  'cart.CartItemAdded',
  'cart.CartLineQuantityChanged',
  'cart.CartLineRemoved',
  'cart.CartCleared',
  'cart.CartsMerged',
  'cart.CartExpired',
];

/** Carrito de un visitante (cookie) o de un cliente (agregado del contexto cart). */
export class Cart extends AggregateRoot<CartEvent> {
  readonly aggregateType = 'Cart';

  private constructor(version: number, private s: Omit<CartSnapshot, 'version'>) {
    super(s.id, version);
  }

  static create(input: { id: string; customerId: string | null; now: Date }): Cart {
    const cart = new Cart(0, { id: input.id, customerId: input.customerId, lines: [], createdAt: input.now, updatedAt: input.now });
    cart.emit('cart.CartCreated', input.now);
    return cart;
  }

  static rehydrate(snapshot: CartSnapshot): Cart {
    const { version, ...state } = snapshot;
    return new Cart(version, structuredClone(state));
  }

  get customerId(): string | null {
    return this.s.customerId;
  }
  get isEmpty(): boolean {
    return this.s.lines.length === 0;
  }
  get lines(): readonly CartLine[] {
    return this.s.lines;
  }

  addItem(variant: AvailableVariant, quantity: number, lineId: string, now: Date): void {
    this.assertSellable(variant);
    const existing = this.s.lines.find((l) => l.variantId === variant.variantId);
    const total = (existing?.quantity ?? 0) + quantity;
    if (!existing && this.s.lines.length >= MAX_LINES) throw new DomainError('CART_FULL', `El carrito admite hasta ${MAX_LINES} productos distintos`);
    this.assertQuantity(total, variant);
    this.s.lines = existing
      ? this.s.lines.map((l) => (l === existing ? { ...l, quantity: total, unitPriceCents: variant.priceCents } : l))
      : [...this.s.lines, { id: lineId, variantId: variant.variantId, productId: variant.productId, quantity, unitPriceCents: variant.priceCents }];
    this.touch('cart.CartItemAdded', now);
  }

  changeQuantity(lineId: string, quantity: number, variant: AvailableVariant, now: Date): void {
    const line = this.line(lineId);
    this.assertSellable(variant);
    this.assertQuantity(quantity, variant);
    this.s.lines = this.s.lines.map((l) => (l === line ? { ...l, quantity } : l));
    this.touch('cart.CartLineQuantityChanged', now);
  }

  removeLine(lineId: string, now: Date): void {
    this.line(lineId);
    this.s.lines = this.s.lines.filter((l) => l.id !== lineId);
    this.touch('cart.CartLineRemoved', now);
  }

  clear(now: Date): void {
    if (this.isEmpty) return;
    this.s.lines = [];
    this.touch('cart.CartCleared', now);
  }

  /** Combina el carrito de visitante: suma cantidades limitando por stock y por máximo de línea. */
  mergeFrom(other: Cart, availability: Map<string, AvailableVariant>, newLineId: () => string, now: Date): void {
    for (const line of other.lines) {
      const v = availability.get(line.variantId);
      if (!v || !v.published || v.available <= 0) continue;
      const existing = this.s.lines.find((l) => l.variantId === line.variantId);
      const quantity = Math.min((existing?.quantity ?? 0) + line.quantity, MAX_LINE_QUANTITY, v.available);
      if (existing) {
        this.s.lines = this.s.lines.map((l) => (l === existing ? { ...l, quantity } : l));
      } else if (this.s.lines.length < MAX_LINES) {
        this.s.lines = [...this.s.lines, { id: newLineId(), variantId: v.variantId, productId: v.productId, quantity, unitPriceCents: v.priceCents }];
      }
    }
    this.touch('cart.CartsMerged', now);
  }

  expire(now: Date): void {
    this.touch('cart.CartExpired', now);
  }

  toSnapshot(): CartSnapshot {
    return { ...structuredClone(this.s), version: this.version };
  }

  private line(lineId: string): CartLine {
    const line = this.s.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundError('LINE_NOT_FOUND', 'Ese producto ya no está en el carrito');
    return line;
  }

  private assertSellable(v: AvailableVariant) {
    if (!v.published) throw new DomainError('PRODUCT_UNAVAILABLE', 'Este producto ya no está disponible');
  }

  private assertQuantity(quantity: number, v: AvailableVariant) {
    if (quantity > MAX_LINE_QUANTITY) throw new DomainError('LINE_LIMIT', `Podés llevar hasta ${MAX_LINE_QUANTITY} unidades por producto`);
    if (quantity > v.available) {
      throw new DomainError('INSUFFICIENT_STOCK', v.available > 0 ? `Solo quedan ${v.available} unidades` : 'No queda stock de este talle', { available: v.available });
    }
  }

  private touch(type: CartEvent['type'], now: Date) {
    this.s.updatedAt = now;
    this.emit(type, now);
  }

  private emit(type: CartEvent['type'], now: Date) {
    this.record(type, { snapshot: { ...this.toSnapshot(), version: this.version + 1 } }, now);
  }
}

export interface CartRepository {
  findById(id: string): Promise<Cart | null>;
  findByCustomer(customerId: string): Promise<Cart | null>;
  save(cart: Cart): Promise<void>;
  delete(cart: Cart): Promise<void>;
  /** Ids de carritos de visitante sin actividad desde `before`. */
  staleGuestCarts(before: Date, limit: number): Promise<string[]>;
}
