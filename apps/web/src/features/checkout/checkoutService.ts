import type { CheckoutQuote, CheckoutQuoteRequest, OrderDetail, OrderStatus, OrderSummary, Page, PlaceOrderRequest } from '@radian/contracts';
import { httpClient } from '../../shared/api/httpClient';

export const checkoutService = {
  quote: (body: CheckoutQuoteRequest) => httpClient.post<CheckoutQuote>('/api/checkout/quote', body),
  /** 201 pagado · 202 pago pendiente (timeout del proveedor) · errores como ApiError. */
  placeOrder: (body: PlaceOrderRequest, idempotencyKey: string) =>
    httpClient.post<OrderDetail>('/api/checkout/orders', body, { headers: { 'idempotency-key': idempotencyKey }, timeoutMs: 30_000 }),
};

export const ordersService = {
  listMine: (page = 1) => httpClient.get<Page<OrderSummary>>('/api/orders', { query: { page } }),
  getMine: (number: string) => httpClient.get<OrderDetail>(`/api/orders/${number}`),
  listAdmin: (status: OrderStatus | undefined, page = 1) => httpClient.get<Page<OrderSummary>>('/api/admin/orders', { query: { status, page } }),
  getAdmin: (number: string) => httpClient.get<OrderDetail>(`/api/admin/orders/${number}`),
  ship: (number: string, expectedVersion: number, trackingCode: string) => httpClient.post<OrderDetail>(`/api/admin/orders/${number}/ship`, { expectedVersion, trackingCode }),
  cancel: (number: string, expectedVersion: number, reason: string) => httpClient.post<OrderDetail>(`/api/admin/orders/${number}/cancel`, { expectedVersion, reason }),
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Pago pendiente',
  paid: 'Pagado',
  shipped: 'Enviado',
  cancelled: 'Cancelado',
};
