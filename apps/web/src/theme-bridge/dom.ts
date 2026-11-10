/**
 * Conecta los controles del tema que en Shopify dependían de servicios propios de la plataforma
 * (cuenta, vista rápida, selector de país, newsletter) con las pantallas de esta aplicación.
 * No cambia el markup: solo decide adónde lleva cada click.
 */
export interface DomBridgeOptions {
  navigate?: (path: string) => void;
}

const ACCOUNT_TRIGGER = 'shopify-account, a[href^="/customer_authentication"], a[href^="/account"]';

/** Ruta propia equivalente a un link del tema, o `null` si el link ya sirve tal cual. */
export function resolveThemeLink(href: string): string | null {
  if (/^https?:\/\/shopify\.com\/\d+\/account\/orders/.test(href)) return '/cuenta/pedidos';
  if (/^https?:\/\/shopify\.com\/\d+\/account/.test(href)) return '/cuenta';
  if (href.startsWith('/customer_authentication')) return '/cuenta';
  if (/^\/account\/(login|register)/.test(href)) return href.includes('register') ? '/cuenta/registro' : '/cuenta/ingresar';
  if (href.startsWith('/account')) return '/cuenta';
  return null;
}

export function installDomBridge({ navigate = (path) => window.location.assign(path) }: DomBridgeOptions = {}): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    // Vista rápida: en la tienda original abría un modal servido por Shopify; acá lleva al producto.
    const quickView = target.closest<HTMLElement>('[data-quick-view][data-product-url]');
    if (quickView?.dataset['productUrl']) {
      event.preventDefault();
      event.stopImmediatePropagation();
      navigate(quickView.dataset['productUrl']);
      return;
    }

    const account = target.closest<HTMLElement>(ACCOUNT_TRIGGER);
    const link = target.closest<HTMLAnchorElement>('a[href]');
    const destination = link ? resolveThemeLink(link.getAttribute('href') ?? '') : account ? '/cuenta' : null;
    if (destination) {
      event.preventDefault();
      event.stopImmediatePropagation();
      navigate(destination);
    }
  };

  const onSubmit = (event: SubmitEvent) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    const action = form?.getAttribute('action') ?? '';
    if (!form) return;
    if (action.startsWith('/localization')) {
      // Selector de país/idioma: la tienda de demostración opera en un solo mercado.
      event.preventDefault();
      return;
    }
    if (action.startsWith('/contact')) {
      event.preventDefault();
      const email = form.querySelector<HTMLInputElement>('input[type="email"]');
      if (email) {
        email.value = '';
        email.placeholder = '¡Gracias por suscribirte!';
      }
    }
  };

  document.addEventListener('click', onClick, true);
  document.addEventListener('submit', onSubmit, true);
  return () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('submit', onSubmit, true);
  };
}
