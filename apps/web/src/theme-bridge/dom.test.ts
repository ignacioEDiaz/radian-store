import { afterEach, describe, expect, it, vi } from 'vitest';
import { installDomBridge, resolveThemeLink } from './dom';

let uninstall: (() => void) | undefined;
afterEach(() => {
  uninstall?.();
  document.body.innerHTML = '';
});

function mount(html: string) {
  document.body.innerHTML = html;
  const navigate = vi.fn();
  uninstall = installDomBridge({ navigate });
  return navigate;
}
const click = (selector: string) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  document.querySelector(selector)!.dispatchEvent(event);
  return event;
};

describe('links del tema', () => {
  it('lleva los links de cuenta de Shopify a las pantallas propias', () => {
    expect(resolveThemeLink('/customer_authentication/redirect?locale=en&region_country=US')).toBe('/cuenta');
    expect(resolveThemeLink('https://shopify.com/83067044094/account/orders')).toBe('/cuenta/pedidos');
    expect(resolveThemeLink('https://shopify.com/83067044094/account/profile')).toBe('/cuenta');
    expect(resolveThemeLink('/account/login')).toBe('/cuenta/ingresar');
    expect(resolveThemeLink('/account/register')).toBe('/cuenta/registro');
  });

  it('no toca los links que ya resuelve la aplicación', () => {
    for (const href of ['/', '/collections/all', '/products/sable-blazer', '/search?q=boot', '/pages/about', 'https://www.instagram.com/']) {
      expect(resolveThemeLink(href)).toBeNull();
    }
  });
});

describe('controles del tema', () => {
  it('el ícono de cuenta (componente de Shopify) abre Mi cuenta', () => {
    const navigate = mount('<shopify-account><span id="icon">👤</span></shopify-account>');
    const event = click('#icon');
    expect(navigate).toHaveBeenCalledWith('/cuenta');
    expect(event.defaultPrevented).toBe(true);
  });

  it('"vista rápida" lleva a la página del producto y no deja que el tema intente abrir su modal', () => {
    const navigate = mount('<button data-quick-view data-product-url="/products/sable-blazer"><span id="label">Vista rápida</span></button>');
    const themeHandler = vi.fn();
    document.querySelector('button')!.addEventListener('click', themeHandler);
    click('#label');
    expect(navigate).toHaveBeenCalledWith('/products/sable-blazer');
    expect(themeHandler).not.toHaveBeenCalled();
  });

  it('los links normales siguen su curso; con Ctrl/⌘ tampoco interviene', () => {
    const navigate = mount('<a id="shop" href="/collections/all">Tienda</a><a id="acc" href="/account">Cuenta</a>');
    expect(click('#shop').defaultPrevented).toBe(false);
    document.querySelector('#acc')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    expect(navigate).not.toHaveBeenCalled();
    click('#acc');
    expect(navigate).toHaveBeenCalledWith('/cuenta');
  });

  it('el selector de país no envía el formulario a Shopify y el newsletter agradece', () => {
    mount(`
      <form id="loc" action="/localization" method="post"><button>US</button></form>
      <form id="news" action="/contact#Newsletter" method="post"><input type="email" value="ana@example.com" /></form>
    `);
    const submit = (id: string) => {
      const event = new Event('submit', { bubbles: true, cancelable: true });
      document.getElementById(id)!.dispatchEvent(event);
      return event;
    };
    expect(submit('loc').defaultPrevented).toBe(true);
    expect(submit('news').defaultPrevented).toBe(true);
    const email = document.querySelector<HTMLInputElement>('#news input')!;
    expect(email.value).toBe('');
    expect(email.placeholder).toMatch(/gracias/i);
  });
});
