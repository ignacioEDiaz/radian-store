/**
 * Convierte el documento original del tema (la home clonada, sin tocar) en los dos documentos que
 * sirve la web:
 *
 *  - `home`: la home tal cual, con sus secciones, estilos y animaciones.
 *  - `app`:  el mismo marco (barra, header, menús, footer, drawers) con `<main>` vacío para que
 *            React monte ahí las páginas internas (catálogo, producto, checkout, cuenta, admin).
 *
 * Regla: del original solo se quitan scripts invisibles que hablan con servicios de Shopify que
 * acá no existen (analítica, pixels, login de Shop). Nada de markup, estilos ni scripts del tema.
 */
export type ShellKind = 'home' | 'app';

export interface ShellInjection {
  /** Etiquetas a insertar al final de `<head>` (estilos de la app). */
  head?: string;
  /** Etiquetas a insertar al final de `<body>` (el bundle de React). */
  body?: string;
}

/** Scripts de terceros que no forman parte del tema: telemetría y servicios de Shopify. */
const TRACKER_MARKERS = [
  'shopify.exit_interstitial',
  '/checkouts/internal/preloads',
  'shop-js/modules',
  'SignInWithShop',
  'shop-js-analytics',
  'id="captcha-bootstrap"',
  'shopify-origin-trials',
  'webmcp_adapter',
  'privacy-banner',
  '__TREKKIE_SHIM_QUEUE',
  'wpmLoader',
  'ShopifyAnalytics',
  'class="analytics"',
  'data-application="storefront-renderer"',
  'web-components/account.js',
  'shopify-customer-account-data',
  'storefront/standard-actions.js',
  'id="__st"',
];

/**
 * Estilos del tema que necesitan las páginas internas. Algunos vienen en la home pero dentro de
 * `<main>` (que en estas páginas se vacía) y otros son propios de colección/producto/búsqueda.
 */
const INNER_STYLES = [
  'product',
  'component-product-detail-containers',
  'component-theme-blocks',
  'product-media-layouts',
  'product-sticky-atc',
  'collection',
  'sticky-filter-trigger',
  'search',
  'section-product-recommendations',
  'section-cart',
];

const ASSETS = '/cdn/shop/t/8/assets/';
const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script>/g;
const TOP_LOGO_RE =
  /<span class="nav-logo__variant nav-logo__variant--top">[\s\S]*?<\/span>\s*<\/span>(?=\s*<span class="nav-logo__variant nav-logo__variant--default">)/;

export function stripTrackers(html: string): string {
  return html
    .replace(SCRIPT_RE, (tag) => (TRACKER_MARKERS.some((m) => tag.includes(m)) ? '' : tag))
    .replace(/<link\b[^>]*(?:monorail-edge\.shopifysvc\.com|shop\.app|\/\.well-known\/ucp)[^>]*>/g, '');
}

function replaceMain(html: string, inner: string): string {
  const open = /<main\b[^>]*>/.exec(html);
  const close = html.lastIndexOf('</main>');
  if (!open || close < 0) throw new Error('El documento del tema no tiene <main>');
  return html.slice(0, open.index + open[0].length) + inner + html.slice(close);
}

/** Ruta del stylesheet como la referencia el documento original (con su hash) o, si no está, la del archivo local. */
function styleHref(original: string, name: string): string {
  const start = original.indexOf(`${ASSETS}${name}__`);
  if (start < 0) return `${ASSETS}${name}.css`;
  return original.slice(start, original.indexOf('.css', start) + 4);
}

/**
 * El documento trae un traductor que reescribe textos en vivo (inglés → español, emails → uno de
 * ejemplo). El contenido de React ya está en español y muestra datos reales (emails de pedidos),
 * así que en las páginas internas se le indica que no entre a la raíz de React. Cada reemplazo es
 * obligatorio: si el traductor cambia, el build falla en vez de dejar datos alterados en silencio.
 */
const TRANSLATOR_GUARDS: [find: string, replace: string][] = [
  ['if (!p || SKIP[p.nodeName]) return;', 'if (!p || SKIP[p.nodeName] || (p.closest && p.closest("#root"))) return;'],
  ['if (root.nodeType !== 1 || SKIP[root.nodeName]) return;', 'if (root.nodeType !== 1 || SKIP[root.nodeName] || root.closest("#root")) return;'],
  ['return n.nodeType === 1 && SKIP[n.nodeName] ?', 'return n.nodeType === 1 && (SKIP[n.nodeName] || n.id === "root") ?'],
  ['function fixEl(el) {', 'function fixEl(el) {\n    if (el.closest && el.closest("#root")) return;'],
];

function keepTranslatorOutOfReact(html: string): string {
  const start = html.indexOf('<script id="ig-traductor">');
  if (start < 0) return html;
  const end = html.indexOf('</script>', start);
  let script = html.slice(start, end);
  for (const [find, replace] of TRANSLATOR_GUARDS) {
    if (!script.includes(find)) throw new Error(`El traductor del tema cambió: no se encontró "${find}"`);
    script = script.replace(find, replace);
  }
  return html.slice(0, start) + script + html.slice(end);
}

function toInnerPage(html: string): string {
  let out = keepTranslatorOutOfReact(replaceMain(html, '<div id="root" class="app-root"></div>'));
  out = out.replace(/(<body\b[^>]*\bclass=")template-index"/, '$1template-app template-inner"');
  // Header de página interna: sin la transparencia ni el logo claro que la home usa sobre el hero.
  out = out.replace(/<nav\b[^>]*\bid="mainNav"[^>]*>/, (tag) =>
    tag.replace(/\s+nav--homepage-transparent\b/, '').replace(/\s+nav--top-shade\b/, ''),
  );
  out = out.replace(/(<a\b[^>]*\bclass="nav-logo) nav-logo--has-top"/, '$1"').replace(TOP_LOGO_RE, '');
  const links = INNER_STYLES.map((name) => `<link href="${styleHref(html, name)}" media="all" rel="stylesheet" type="text/css"/>`);
  return out.replace('</head>', `${links.join('\n')}\n</head>`);
}

export function buildShell(original: string, kind: ShellKind, inject: ShellInjection = {}): string {
  let html = stripTrackers(original);
  if (kind === 'app') html = toInnerPage(html);
  if (!html.includes('</head>') || !html.includes('</body>')) throw new Error('Documento del tema inválido');
  if (inject.head) html = html.replace('</head>', `${inject.head}\n</head>`);
  if (inject.body) {
    const at = html.lastIndexOf('</body>');
    html = `${html.slice(0, at)}${inject.body}\n${html.slice(at)}`;
  }
  return html;
}
