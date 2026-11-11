import { FREE_SHIPPING_THRESHOLD_CENTS, type CartLineView, type CartView, type CartWarning } from '@radian/contracts';
import { formatMoney } from '../shared/format/money';
import { toAjaxCart } from './ajaxCart';

/**
 * Arma el HTML de la sección "cart-drawer" con el mismo markup que renderiza el tema original
 * (clases, data-attributes y estructura), para que su JavaScript —apertura, steppers de cantidad,
 * contador, animaciones— funcione sin cambios sobre los datos de nuestro backend.
 */
export interface DrawerShell {
  sectionId: string;
  /** Atributo `style` del drawer original (ancho, tipografías): se conserva tal cual. */
  style: string;
  className: string;
  /** Panel lateral "También te puede gustar" del drawer original (queda oculto: no hay recomendaciones). */
  aside: string;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

const ICON_CLOSE =
  '<svg class="icon-line" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="M4 4l12 12M16 4L4 16"/></svg>';
const ICON_TRUCK =
  '<svg class="icon-line" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><rect x="1" y="5" width="12" height="9" rx="1"/><path d="M13 8l3 1 2 3v3h-5V8z"/><circle cx="5" cy="16" r="1.5"/><circle cx="15" cy="16" r="1.5"/></svg>';

const motionLabel = (text: string) =>
  `<span class="motion-label" data-motion-label data-motion-label-effect="inherit" data-motion-label-context="auto"><span class="motion-label__canonical" data-motion-label-canonical>${esc(text)}</span></span>`;

const WARNINGS: Record<CartWarning, string> = {
  PRICE_CHANGED: 'El precio de este producto cambió desde que lo agregaste.',
  OUT_OF_STOCK: 'Sin stock: quitalo para poder finalizar la compra.',
  QUANTITY_REDUCED: 'Ajustamos la cantidad al stock disponible.',
  UNAVAILABLE: 'Este producto ya no está disponible.',
};

function emptyState(): string {
  return `<div class="cart-drawer__empty"><p>Tu carrito está vacío</p>
<a href="/collections/all" class="btn-primary motion-label-trigger" data-cart-drawer-close>${motionLabel('Seguir comprando')}</a></div>`;
}

function freeShippingBar(cart: CartView, sectionId: string): string {
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD_CENTS - cart.subtotalCents);
  const progress = Math.min(100, Math.round((cart.subtotalCents / FREE_SHIPPING_THRESHOLD_CENTS) * 100));
  const message = remaining === 0 ? '¡Tenés envío gratis!' : `Sumá <strong>${esc(formatMoney(remaining))}</strong> y el envío es gratis`;
  const id = `FreeShippingMessage-${sectionId}-cart-drawer`;
  return `<div class="free-shipping-bar free-shipping-bar--cart-drawer" style="--free-shipping-progress: ${progress}%; --free-shipping-fill: linear-gradient(57deg, rgba(249, 119, 255, 1) 8%, rgba(54, 212, 255, 1) 47%, rgba(43, 252, 135, 1) 83%); --free-shipping-align-desktop: start; --free-shipping-align-mobile: start; --block-spacing-top-desktop: 0px; --block-spacing-bottom-desktop: 18px; --block-spacing-top-mobile: 0px; --block-spacing-bottom-mobile: 18px;">
<div class="free-shipping-bar__message-row"><span class="free-shipping-bar__icon">${ICON_TRUCK}</span>
<div id="${esc(id)}" class="free-shipping-bar__message rte type-style type-style--body" aria-live="off" aria-atomic="true">${message}</div></div>
<div class="free-shipping-bar__track" role="progressbar" aria-labelledby="${esc(id)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span class="free-shipping-bar__fill"></span></div>
</div>`;
}

function lineItem(line: CartLineView, index: number): string {
  const n = index + 1;
  const name = `${line.title} - ${line.color} / ${line.size}`;
  const url = `/products/${encodeURIComponent(line.productSlug)}`;
  const warning = line.warnings.map((w) => WARNINGS[w]).find(Boolean) ?? '';
  const image = line.image
    ? `<a href="${esc(url)}" class="cart-item__image-link"><img src="${esc(line.image.url)}" alt="${esc(line.image.alt)}" width="${line.image.width}" height="${line.image.height}" loading="lazy" srcset="${esc(line.image.srcset.map((s) => `${s.url} ${s.width}w`).join(', '))}" sizes="100px" class="cart-item__image"></a>`
    : '';
  return `<div class="cart-item" data-line="${n}" data-key="${esc(line.lineId)}" data-line-qty="${line.quantity}" aria-busy="false">${image}
<div class="cart-item__details">
<a href="${esc(url)}" class="cart-item__title type-style type-style--caption">${esc(line.title)}</a><div class="cart-item__product-price"><span>${esc(formatMoney(line.unitPriceCents))}</span></div>
<p class="cart-item__variant">Color: ${esc(line.color)}</p><p class="cart-item__variant">Talle: ${esc(line.size)}</p><div class="cart-item__bottom"><div class="cart-item__qty" data-cart-quantity-rules data-min-rule="1" data-step-rule="1" data-max-rule="${Math.max(1, line.maxQuantity)}">
<button class="cart-item__qty-btn focus-inset" data-line="${n}" data-change="-1" aria-label="Restar una unidad de ${esc(name)}" aria-describedby="CartDrawerLineError-${n}">−</button>
<span class="cart-item__qty-val">${line.quantity}</span>
<button class="cart-item__qty-btn focus-inset" data-line="${n}" data-change="1" aria-label="Sumar una unidad de ${esc(name)}" aria-describedby="CartDrawerLineError-${n}">+</button>
</div><div class="cart-item__price" data-cart-line-total>
<span class="cart-item__price-content"><span>${esc(formatMoney(line.lineTotalCents))}</span></span>
<span class="cart-item__price-loader" aria-hidden="true"></span>
<span class="visually-hidden" data-cart-line-loading-status aria-live="polite" aria-atomic="true"></span>
</div>
<button type="button" class="cart-item__remove" data-line="${n}" data-quantity="0" aria-label="Quitar ${esc(name)}">${ICON_CLOSE}</button>
</div>
<p id="CartDrawerLineError-${n}" class="cart-item__line-error" data-cart-line-error role="alert" aria-atomic="true"${warning ? '' : ' hidden'}>${esc(warning)}</p></div>
</div>`;
}

function footer(cart: CartView, sectionId: string): string {
  const formId = `CartDrawerCheckout-${sectionId}`;
  return `<div class="cart-drawer__footer">
<div class="cart-subtotal type-style type-style--page-title"><span>Subtotal</span><span class="cart-subtotal__price">${esc(formatMoney(cart.subtotalCents))}</span></div>
<div class="cart-drawer__tax-row"><p class="cart-taxes-note">El envío y los descuentos se calculan al finalizar la compra</p></div>
<form id="${esc(formId)}" action="/checkout" method="get" hidden></form>
<div class="cart-drawer__actions"><a href="/cart" class="btn-outline cart-view-cart-btn motion-label-trigger">${motionLabel('Ver bolsa')}</a>
<button type="submit" form="${esc(formId)}" class="btn-primary cart-checkout-btn motion-label-trigger">${motionLabel('Finalizar compra')}</button></div>
<button type="button" class="cart-clear-btn motion-label-trigger" data-cart-clear>${motionLabel('Vaciar bolsa')}</button>
</div>`;
}

export function renderCartDrawerSection(cart: CartView, shell: DrawerShell): string {
  const titleId = `CartDrawerTitle-${shell.sectionId}`;
  const state = JSON.stringify(toAjaxCart(cart)).replace(/</g, '\\u003c');
  const hasItems = cart.lines.length > 0;
  const body = hasItems
    ? `<div class="cart-drawer__scroll-region" data-cart-drawer-scroll-region>${freeShippingBar(cart, shell.sectionId)}
<div class="cart-drawer__items">${cart.lines.map(lineItem).join('\n')}</div></div>${footer(cart, shell.sectionId)}`
    : emptyState();

  return `<div id="shopify-section-${esc(shell.sectionId)}" class="shopify-section shopify-section-group-overlay-group">
<div id="cart-drawer" data-section-id="${esc(shell.sectionId)}" data-drawer-hide-when-closed data-drawer-transition-root data-cart-item-count="${cart.itemCount}" data-cart-total-price="${cart.subtotalCents}" class="${esc(shell.className)}" aria-hidden="true" aria-labelledby="${esc(titleId)}" role="dialog" aria-modal="true" inert hidden style="${esc(shell.style)}">
<script type="application/json" data-cart-state>${state}</script>
<div class="cart-drawer__header">
<h2 class="cart-drawer__title type-style type-style--secondary-heading"><span id="${esc(titleId)}" data-cart-title>Tu carrito</span><span class="cart-drawer__item-count" data-cart-drawer-count${cart.itemCount > 0 ? '' : ' hidden'}> (${cart.itemCount})</span></h2>
<button type="button" class="cart-drawer__close overlay-close-control theme-close-button" aria-label="Cerrar carrito" data-cart-drawer-close><span class="overlay-close-control__icon" aria-hidden="true">${ICON_CLOSE}</span></button>
</div>
<p class="cart-drawer__status" data-cart-status role="alert" aria-atomic="true" hidden></p>
<div class="cart-drawer__body" data-cart-drawer-body data-lenis-prevent>${body}</div>
${shell.aside}<template data-cart-drawer-empty-template>${emptyState()}</template>
</div>
</div>`;
}
