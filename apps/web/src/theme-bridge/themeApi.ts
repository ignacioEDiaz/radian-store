import type { CartView } from '@radian/contracts';
import { toAjaxCart, type AjaxCart } from './ajaxCart';
import type { DrawerShell } from './cartDrawerSection';

/** Superficie del JavaScript del tema que usa el puente (todo opcional: el tema puede no haber cargado). */
interface ThemeWindow {
  Axiom?: {
    cart?: { open?: (returnFocus?: Element | null) => void; close?: () => void; render?: (cart: AjaxCart) => Promise<unknown> | undefined };
    updateCartCount?: (count: number) => void;
    cartStrings?: Record<string, string | null>;
    productStrings?: Record<string, string | null>;
  };
  AxiomStandardStorefront?: {
    addLines?: (items: { id: string; quantity: number }[], options?: Record<string, unknown>) => Promise<unknown>;
  };
}

const theme = () => window as unknown as ThemeWindow;

let cachedShell: DrawerShell | null = null;

/** Lee una sola vez los datos fijos del drawer original (el tema reemplaza su contenido al renderizar). */
export function readDrawerShell(doc: Document = document): DrawerShell | null {
  if (cachedShell) return cachedShell;
  const drawer = doc.getElementById('cart-drawer');
  if (!drawer) return null;
  const className = [...drawer.classList].filter((c) => !c.startsWith('is-')).join(' ');
  cachedShell = {
    sectionId: drawer.dataset['sectionId'] ?? '',
    style: drawer.getAttribute('style') ?? '',
    className,
    aside: drawer.querySelector('aside[data-cart-side]')?.outerHTML ?? '',
  };
  return cachedShell;
}

/** Vuelca un carrito del backend en el drawer del tema (contenido + contador del header). */
export function renderThemeCart(cart: CartView, sections: Record<string, string> | undefined): void {
  const axiom = theme().Axiom;
  if (!sections || !axiom?.cart?.render) {
    axiom?.updateCartCount?.(cart.itemCount);
    return;
  }
  void Promise.resolve(axiom.cart.render({ ...toAjaxCart(cart), sections })).catch(() => axiom.updateCartCount?.(cart.itemCount));
}

export const openThemeCart = () => theme().Axiom?.cart?.open?.(document.activeElement);
export const closeThemeCart = () => theme().Axiom?.cart?.close?.();

/**
 * Agrega al carrito por el mismo camino que usa el tema (animación del botón, apertura del
 * drawer, contador). El pedido termina en nuestra API a través del puente de `fetch`.
 */
export function addToThemeCart(variantId: string, quantity: number, target?: Element | null): Promise<unknown> {
  const standard = theme().AxiomStandardStorefront;
  if (!standard?.addLines) return Promise.reject(new Error('El carrito todavía no está listo. Probá de nuevo en un momento.'));
  return standard.addLines([{ id: variantId, quantity }], { source: 'app', context: 'product', ...(target ? { target } : {}) });
}

/** Los textos de error del tema vienen en inglés en su configuración: se pasan a español. */
export function localizeThemeStrings(): void {
  const axiom = theme().Axiom;
  if (!axiom) return;
  Object.assign((axiom.cartStrings ??= {}), {
    title: 'Tu carrito',
    empty: 'Tu carrito está vacío',
    continueShopping: 'Seguir comprando',
    removeAll: 'Vaciar bolsa',
    removeAllConfirm: 'Confirmar: vaciar bolsa',
    addError: 'No se pudo agregar el producto al carrito.',
    updateError: 'No pudimos actualizar este producto. Probá de nuevo.',
    updating: 'Cargando',
    quantityLimitReached: 'Solo podés agregar [count] unidades de este producto.',
    maximumQuantityInBag: 'Ya tenés la cantidad máxima de este producto en tu bolsa.',
    freeShippingProgressUnder: 'Sumá [amount] y el envío es gratis',
    freeShippingProgressReached: '¡Tenés envío gratis!',
  });
  Object.assign((axiom.productStrings ??= {}), {
    addToCart: 'Agregar al carrito',
    soldOut: 'Agotado',
    unavailable: 'No disponible',
    loading: 'Agregando...',
    added: 'Agregado',
    bundleAddError: 'No se pudo agregar el conjunto al carrito.',
    maximumQuantityInBag: 'Ya tenés la cantidad máxima de este producto en tu bolsa.',
  });
}
