import type { CartLine, CartRepository } from '../domain/cart.js';
import type { VariantInfo } from './cart-view.js';

export type VariantLookup = VariantInfo & { productId: string };

/**
 * Capa anticorrupción hacia catalog/inventory: datos vigentes de variantes.
 * En comandos lee la base de escritura (valida invariantes); en consultas, la de lectura.
 */
export interface CatalogLookup {
  lookup(variantIds: string[]): Promise<Map<string, VariantLookup>>;
}

export interface CartRepos {
  carts: CartRepository;
  catalog: CatalogLookup;
}

/** Dueño del carrito en un pedido: cliente con sesión o visitante (id de la cookie, si hay). */
export type CartOwner = { customerId: string } | { guestCartId: string | null };

export interface CartReadModel {
  find(owner: CartOwner): Promise<{ id: string; lines: CartLine[] } | null>;
  catalog: CatalogLookup;
}
