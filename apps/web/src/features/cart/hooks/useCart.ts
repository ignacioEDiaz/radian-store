import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CartLineView, CartView } from '@radian/contracts';
import { queryKeys } from '../../../shared/api/queryKeys';
import { cartService } from '../services/cartService';

export const emptyCart: CartView = { id: null, lines: [], itemCount: 0, subtotalCents: 0, currency: 'USD' };

export function useCart() {
  return useQuery({ queryKey: queryKeys.cart, queryFn: cartService.get, staleTime: 30_000 });
}

/**
 * Mutación del carrito con actualización optimista: `optimistic` arma el estado provisional,
 * si la API rechaza se restaura el anterior, y al confirmar se reemplaza por el carrito del servidor.
 */
function useCartMutation<I>(run: (input: I) => Promise<CartView>, optimistic: (cart: CartView, input: I) => CartView, onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onMutate: async (input: I) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.cart });
      const previous = queryClient.getQueryData<CartView>(queryKeys.cart);
      queryClient.setQueryData<CartView>(queryKeys.cart, optimistic(previous ?? emptyCart, input));
      return { previous };
    },
    onError: (_err, _input, context) => queryClient.setQueryData(queryKeys.cart, context?.previous ?? emptyCart),
    onSuccess: (cart) => {
      queryClient.setQueryData(queryKeys.cart, cart);
      onSuccess?.();
    },
  });
}

export interface AddInput {
  variantId: string;
  quantity: number;
  preview: Omit<CartLineView, 'lineId' | 'quantity' | 'lineTotalCents' | 'warnings' | 'previousUnitPriceCents'>;
}

export function useAddToCart(onAdded?: () => void) {
  return useCartMutation<AddInput>(
    (i) => cartService.add(i.variantId, i.quantity),
    (cart, i) => {
      const existing = cart.lines.find((l) => l.variantId === i.variantId);
      const lines = existing
        ? cart.lines.map((l) => (l === existing ? { ...l, quantity: l.quantity + i.quantity, lineTotalCents: l.unitPriceCents * (l.quantity + i.quantity) } : l))
        : [...cart.lines, { ...i.preview, lineId: `pending-${i.variantId}`, quantity: i.quantity, lineTotalCents: i.preview.unitPriceCents * i.quantity, warnings: [], previousUnitPriceCents: null }];
      return { ...cart, lines, itemCount: cart.itemCount + i.quantity, subtotalCents: cart.subtotalCents + i.preview.unitPriceCents * i.quantity };
    },
    onAdded,
  );
}

export function useUpdateCartLine() {
  return useCartMutation<{ lineId: string; quantity: number }>(
    (i) => cartService.update(i.lineId, i.quantity),
    (cart, i) => {
      const lines = cart.lines.map((l) => (l.lineId === i.lineId ? { ...l, quantity: i.quantity, lineTotalCents: l.unitPriceCents * i.quantity } : l));
      return recompute(cart, lines);
    },
  );
}

export function useRemoveCartLine() {
  return useCartMutation<string>(
    (lineId) => cartService.remove(lineId),
    (cart, lineId) => recompute(
      cart,
      cart.lines.filter((l) => l.lineId !== lineId),
    ),
  );
}

function recompute(cart: CartView, lines: CartLineView[]): CartView {
  const sellable = lines.filter((l) => l.available);
  return { ...cart, lines, itemCount: sellable.reduce((n, l) => n + l.quantity, 0), subtotalCents: sellable.reduce((n, l) => n + l.lineTotalCents, 0) };
}
