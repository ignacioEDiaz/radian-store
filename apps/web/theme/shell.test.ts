// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildShell, stripTrackers } from './shell.ts';

const original = readFileSync(path.join(import.meta.dirname, 'home.original.html'), 'utf8');
const count = (html: string, needle: string) => html.split(needle).length - 1;
const themeScripts = (html: string) =>
  [...html.matchAll(/<script[^>]*src="(\/cdn\/shop\/t\/8\/assets\/[^"]+)"/g)].map((m) => m[1] ?? '');
const sections = (html: string) => [...html.matchAll(/id="(shopify-section-[^"]+)"/g)].map((m) => m[1] ?? '');
const stylesheets = (html: string) => [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map((m) => m[0]);
const withoutScripts = (html: string) =>
  html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/\n\s*\n/g, '\n');

describe('shell del tema', () => {
  describe('home', () => {
    const home = buildShell(original, 'home', { body: '<script type="module" src="/x.js"></script>' });

    it('conserva todas las secciones, estilos y scripts del tema original', () => {
      expect(sections(home)).toEqual(sections(original));
      expect(stylesheets(home)).toEqual(stylesheets(original));
      expect(themeScripts(home)).toEqual(themeScripts(original));
      expect(count(home, '<style')).toBe(count(original, '<style'));
    });

    it('no modifica el markup: solo quita scripts de terceros y agrega el bundle', () => {
      expect(withoutScripts(home)).toBe(withoutScripts(stripTrackers(original)));
      // lo único que se va fuera de <script> son 3 <link> de preconexión a servicios de Shopify
      expect(withoutScripts(original).length - withoutScripts(stripTrackers(original)).length).toBeLessThan(400);
    });

    it('quita la telemetría y los servicios de Shopify', () => {
      for (const marker of ['wpmLoader', 'shopify-perf-kit', 'privacy-banner', 'shop-js/modules', 'web-components/account.js', 'ShopifyAnalytics']) {
        expect(home).not.toContain(marker);
      }
    });

    it('mantiene el traductor y la configuración del tema', () => {
      expect(home).toContain('id="ig-traductor"');
      expect(home).toContain('id="AxiomThemeConfig"');
      expect(home).toContain('standard-events.js');
    });

    it('inyecta el bundle al final del body', () => {
      expect(home.indexOf('src="/x.js"')).toBeGreaterThan(home.lastIndexOf('</footer>'));
      expect(home.trimEnd().endsWith('</html>')).toBe(true);
    });
  });

  describe('páginas internas', () => {
    const app = buildShell(original, 'app', {
      head: '<link rel="stylesheet" href="/a.css">',
      body: '<script type="module" src="/x.js"></script>',
    });

    it('deja el <main> solo con la raíz de React', () => {
      expect(app).toMatch(/<main\b[^>]*><div id="root" class="app-root"><\/div><\/main>/);
      expect(sections(app).filter((id) => id.includes('template--'))).toEqual([]);
    });

    it('conserva header, footer y drawers del tema', () => {
      const frame = sections(original).filter((id) => !id.includes('template--'));
      expect(sections(app)).toEqual(frame);
      expect(app).toContain('id="cart-drawer"');
      expect(app).toContain('id="mainNav"');
    });

    it('usa la variante de header de página interna (sin transparencia de la home)', () => {
      const nav = /<nav\b[^>]*id="mainNav"[^>]*>/.exec(app)![0];
      expect(nav).not.toContain('nav--homepage-transparent');
      expect(nav).not.toContain('nav--top-shade');
      expect(app).toMatch(/<body\b[^>]*class="template-app template-inner"/);
    });

    it('agrega los estilos del tema para colección, producto y búsqueda', () => {
      expect(app).toContain('/cdn/shop/t/8/assets/collection.css');
      expect(app).toContain('/cdn/shop/t/8/assets/product-media-layouts.css');
      expect(app.indexOf('/a.css')).toBeGreaterThan(app.indexOf('collection.css'));
    });

    it('conserva los estilos de producto que en la home venían dentro de <main>', () => {
      const productCss = /\/cdn\/shop\/t\/8\/assets\/product__[0-9a-f]{10}\.css/.exec(original)![0];
      const head = app.slice(0, app.indexOf('</head>'));
      expect(head).toContain(productCss);
    });

    it('el traductor del tema no entra a la raíz de React (no altera emails ni textos de la app)', () => {
      const script = (html: string) => /<script id="ig-traductor">([\s\S]*?)<\/script>/.exec(html)![1]!;
      expect(script(app)).toContain('p.closest("#root")');
      expect(script(app)).toContain('n.id === "root"');
      // En la home el traductor queda exactamente como estaba.
      expect(script(buildShell(original, 'home'))).toBe(script(original));
    });

    it('muestra el logo oscuro: en páginas internas el header es claro', () => {
      const logo = /<a\b[^>]*class="nav-logo[^"]*"[^>]*>[\s\S]*?<\/a>/.exec(app)![0];
      expect(logo).not.toContain('nav-logo--has-top');
      expect(logo).not.toContain('nav-logo__variant--top');
      expect(logo).toContain('nav-logo__variant--default');
      expect(logo).toContain('ig-logo--negro');
    });
  });
});
