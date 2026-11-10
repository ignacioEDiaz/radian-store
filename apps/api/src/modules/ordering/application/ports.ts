import type { DiscountCode } from '../domain/discount-code.js';
import type { Order } from '../domain/order.js';

export interface Card {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
  holder: string;
}

export type ChargeResult =
  | { status: 'approved'; reference: string; brand: string; last4: string }
  | { status: 'declined'; reason: string }
  | { status: 'timeout' };

/** Proveedor de pagos (simulado en este proyecto; intercambiable por uno real). */
export interface PaymentGateway {
  charge(input: { amountCents: number; card: Card; reference: string }): Promise<ChargeResult>;
  refund(input: { reference: string; amountCents: number }): Promise<{ reference: string }>;
}

export interface CheckoutLineSource {
  variantId: string;
  quantity: number;
}

/** Datos vigentes de una variante para cobrar (ACL hacia catalog, sobre la base de escritura). */
export interface PricedVariant {
  variantId: string;
  productId: string;
  sku: string;
  title: string;
  color: string;
  size: string;
  imageUrl: string | null;
  priceCents: number;
  published: boolean;
  /** Disponible (físico − reservado) al momento de cotizar. */
  available: number;
}

export interface CheckoutPorts {
  /** Carrito del comprador (cliente o visitante), leído en la base de escritura. */
  cart(owner: { customerId: string | null; cartId: string | null }): Promise<{ cartId: string; lines: CheckoutLineSource[] } | null>;
  pricing(variantIds: string[]): Promise<Map<string, PricedVariant>>;
  /** Reserva todas las líneas o ninguna (INSUFFICIENT_STOCK con las líneas que faltan). */
  reserve(orderId: string, lines: { variantId: string; quantity: number }[], expiresAt: Date): Promise<void>;
  commit(orderId: string): Promise<void>;
  release(orderId: string): Promise<void>;
  restock(orderId: string): Promise<void>;
  orders: OrderRepository;
  discounts: DiscountRepository;
  nextOrderNumber(): Promise<string>;
}

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  findByNumber(number: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
  /** Pedidos pendientes con la reserva vencida (bloqueados para este proceso). */
  expiredPending(now: Date, limit: number): Promise<Order[]>;
}

export interface DiscountRepository {
  findByCode(code: string): Promise<DiscountCode | null>;
  usedBy(codeId: string, email: string): Promise<boolean>;
  redeem(codeId: string, email: string, orderId: string, at: Date): Promise<void>;
}

export type IdempotencyBegin =
  | { state: 'new' }
  | { state: 'completed'; httpStatus: number; response: unknown }
  | { state: 'processing' }
  | { state: 'mismatch' };

export interface IdempotencyStore {
  begin(scope: string, key: string, requestHash: string): Promise<IdempotencyBegin>;
  complete(scope: string, key: string, httpStatus: number, response: unknown): Promise<void>;
  /** Libera la clave si el pedido no llegó a crearse (el cliente puede reintentar). */
  abandon(scope: string, key: string): Promise<void>;
}
