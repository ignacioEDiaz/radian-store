import type { CartView } from '@radian/contracts';
import type { Clock, IdGenerator } from '../../../shared/application/ports.js';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.js';
import { ConflictError, NotFoundError } from '../../../shared/domain/errors.js';
import { Cart, type AvailableVariant } from '../domain/cart.js';
import { buildCartView, emptyCart } from './cart-view.js';
import type { CartOwner, CartReadModel, CartRepos, VariantLookup } from './ports.js';

const RETRIES = 3;

export interface CartResult {
  cart: CartView;
  /** Id del carrito; para visitantes es el valor de la cookie. */
  cartId: string;
}

const toAvailable = (v: VariantLookup): AvailableVariant => ({
  variantId: v.variantId,
  productId: v.productId,
  priceCents: v.priceCents,
  published: v.published,
  available: v.available,
});

/** Casos de uso del carrito. Cada comando devuelve el carrito resultante (read-your-writes). */
export class CartService {
  constructor(private readonly d: { uow: UnitOfWork<CartRepos>; reader: CartReadModel; clock: Clock; ids: IdGenerator }) {}

  addItem(owner: CartOwner, variantId: string, quantity: number): Promise<CartResult> {
    return this.mutate(owner, true, async (cart, r) => {
      const v = (await r.catalog.lookup([variantId])).get(variantId);
      if (!v) throw new NotFoundError('VARIANT_NOT_FOUND', 'La variante no existe');
      cart.addItem(toAvailable(v), quantity, this.d.ids.uuid(), this.d.clock.now());
    });
  }

  changeQuantity(owner: CartOwner, lineId: string, quantity: number): Promise<CartResult> {
    return this.mutate(owner, false, async (cart, r) => {
      const line = cart.lines.find((l) => l.id === lineId);
      if (!line) throw new NotFoundError('LINE_NOT_FOUND', 'Ese producto ya no está en el carrito');
      const v = (await r.catalog.lookup([line.variantId])).get(line.variantId);
      if (!v) throw new NotFoundError('VARIANT_NOT_FOUND', 'La variante no existe');
      cart.changeQuantity(lineId, quantity, toAvailable(v), this.d.clock.now());
    });
  }

  removeLine(owner: CartOwner, lineId: string): Promise<CartResult> {
    return this.mutate(owner, false, async (cart) => cart.removeLine(lineId, this.d.clock.now()));
  }

  /** Al iniciar sesión: combina el carrito de visitante con el del cliente y elimina el de visitante. */
  async mergeGuestCart(guestCartId: string, customerId: string): Promise<void> {
    await this.retry(() =>
      this.d.uow.run(async (r) => {
        const guest = await r.carts.findById(guestCartId);
        if (!guest || guest.customerId !== null) return;
        const mine = (await r.carts.findByCustomer(customerId)) ?? Cart.create({ id: this.d.ids.uuid(), customerId, now: this.d.clock.now() });
        const info = await r.catalog.lookup(guest.lines.map((l) => l.variantId));
        mine.mergeFrom(guest, new Map([...info].map(([k, v]) => [k, toAvailable(v)])), () => this.d.ids.uuid(), this.d.clock.now());
        await r.carts.save(mine);
        guest.expire(this.d.clock.now());
        await r.carts.delete(guest);
      }),
    );
  }

  /** Política tras un pago: vacía el carrito del comprador. */
  async clear(owner: CartOwner): Promise<void> {
    await this.retry(() =>
      this.d.uow.run(async (r) => {
        const cart = await this.find(r, owner);
        if (!cart) return;
        cart.clear(this.d.clock.now());
        await r.carts.save(cart);
      }),
    );
  }

  /** Elimina carritos de visitante inactivos. Devuelve cuántos expiró. */
  async expireGuestCarts(maxAgeDays = 30): Promise<number> {
    const before = new Date(this.d.clock.now().getTime() - maxAgeDays * 86_400_000);
    return this.d.uow.run(async (r) => {
      const ids = await r.carts.staleGuestCarts(before, 200);
      for (const id of ids) {
        const cart = await r.carts.findById(id);
        if (!cart) continue;
        cart.expire(this.d.clock.now());
        await r.carts.delete(cart);
      }
      return ids.length;
    });
  }

  /** Consulta: modelo de lectura + precios y stock vigentes del catálogo de lectura. */
  async getCart(owner: CartOwner): Promise<CartView> {
    const found = await this.d.reader.find(owner);
    if (!found) return emptyCart();
    const info = await this.d.reader.catalog.lookup(found.lines.map((l) => l.variantId));
    return buildCartView(found.id, found.lines, info);
  }

  private async find(r: CartRepos, owner: CartOwner): Promise<Cart | null> {
    if ('customerId' in owner) return r.carts.findByCustomer(owner.customerId);
    if (!owner.guestCartId) return null;
    const cart = await r.carts.findById(owner.guestCartId);
    return cart && cart.customerId === null ? cart : null;
  }

  private mutate(owner: CartOwner, createIfMissing: boolean, change: (cart: Cart, r: CartRepos) => Promise<void>): Promise<CartResult> {
    return this.retry(() =>
      this.d.uow.run(async (r) => {
        let cart = await this.find(r, owner);
        if (!cart) {
          if (!createIfMissing) throw new NotFoundError('CART_NOT_FOUND', 'No hay un carrito activo');
          cart = Cart.create({ id: this.d.ids.uuid(), customerId: 'customerId' in owner ? owner.customerId : null, now: this.d.clock.now() });
        }
        await change(cart, r);
        await r.carts.save(cart);
        const info = await r.catalog.lookup(cart.lines.map((l) => l.variantId));
        return { cart: buildCartView(cart.id, [...cart.lines], info), cartId: cart.id };
      }),
    );
  }

  /** Dos pestañas sobre el mismo carrito: se recarga y se reaplica (operaciones idempotentes en intención). */
  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        if (!(err instanceof ConflictError && err.code === 'VERSION_CONFLICT') || attempt >= RETRIES) throw err;
      }
    }
  }
}
