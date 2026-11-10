import type { CartView } from '@radian/contracts';
import { httpClient } from '../../../shared/api/httpClient';

/** El total lo calcula siempre el backend; el frontend nunca es fuente de verdad del precio. */
export const cartService = {
  get: () => httpClient.get<CartView>('/api/cart'),
  add: (variantId: string, quantity: number) => httpClient.post<CartView>('/api/cart/items', { variantId, quantity }),
  update: (lineId: string, quantity: number) => httpClient.patch<CartView>(`/api/cart/items/${lineId}`, { quantity }),
  remove: (lineId: string) => httpClient.delete<CartView>(`/api/cart/items/${lineId}`),
};
