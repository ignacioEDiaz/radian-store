import type { QueryClient } from '@tanstack/react-query';
import type { CartView } from '@radian/contracts';
import { queryKeys } from '../shared/api/queryKeys';
import { cartService } from '../features/cart/services/cartService';
import { catalogService } from '../features/catalog/services/catalogService';
import { installDomBridge, type DomBridgeOptions } from './dom';
import { installFetchBridge } from './fetchBridge';
import { createThemeBackend } from './themeBackend';
import { localizeThemeStrings, readDrawerShell, renderThemeCart } from './themeApi';

const whenReady = (run: () => void) =>
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', run, { once: true }) : run();

/**
 * Une el tema original (markup + JavaScript sin modificar) con la aplicación:
 *
 *  1. `fetch` del tema → services → API propia (carrito, búsqueda).
 *  2. La caché de React Query es la única fuente de verdad del carrito: lo que confirma el
 *     servidor se guarda ahí y se vuelca en el drawer y el contador del tema.
 *  3. Los controles que dependían de Shopify (cuenta, vista rápida) llevan a nuestras pantallas.
 */
export function installThemeBridge(queryClient: QueryClient, options: DomBridgeOptions = {}): void {
  /** `true` mientras el propio tema está aplicando una respuesta (ya re-renderiza él). */
  let fromTheme = false;

  const backend = createThemeBackend({
    cart: cartService,
    getProduct: (slug) =>
      queryClient.fetchQuery({ queryKey: queryKeys.catalog.product(slug), queryFn: () => catalogService.getProduct(slug), staleTime: 60_000 }),
    suggestions: (q) => catalogService.suggestions(q),
    drawerShell: () => readDrawerShell(),
    onCart: (cart) => {
      fromTheme = true;
      queryClient.setQueryData(queryKeys.cart, cart);
      fromTheme = false;
    },
  });

  installFetchBridge(backend);
  installDomBridge(options);

  // Cambios del carrito hechos desde React (checkout, login, logout) → drawer y contador del tema.
  queryClient.getQueryCache().subscribe((event) => {
    if (fromTheme || event.type !== 'updated' || event.action.type !== 'success') return;
    if (event.query.queryKey[0] !== queryKeys.cart[0]) return;
    const cart = event.query.state.data as CartView | undefined;
    if (!cart) return;
    // Carrito vacío sobre un drawer ya vacío: no hay nada que volver a dibujar.
    const shown = document.getElementById('cart-drawer')?.dataset['cartItemCount'] ?? '0';
    if (cart.lines.length === 0 && shown === '0') return;
    renderThemeCart(cart, backend.renderDrawer(cart));
  });

  whenReady(() => {
    localizeThemeStrings();
    readDrawerShell();
    // Carrito persistido en el backend (cookie de invitado o cuenta): se muestra al cargar.
    void queryClient.fetchQuery({ queryKey: queryKeys.cart, queryFn: cartService.get, staleTime: 30_000 }).catch(() => undefined);
  });
}
