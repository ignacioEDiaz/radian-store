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

/** Estilos del tema para páginas internas (no vienen en la home). */
const INNER_STYLES = [
  'collection',
  'sticky-filter-trigger',
  'search',
  'product-media-layouts',
  'product-sticky-atc',
  'section-product-recommendations',
  'section-cart',
];

const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script>/g;

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

function toInnerPage(html: string): string {
  let out = replaceMain(html, '<div id="root" class="app-root"></div>');
  out = out.replace(/(<body\b[^>]*\bclass=")template-index"/, '$1template-app template-inner"');
  out = out.replace(/<nav\b[^>]*\bid="mainNav"[^>]*>/, (tag) =>
    tag.replace(/\s+nav--homepage-transparent\b/, '').replace(/\s+nav--top-shade\b/, ''),
  );
  const links = INNER_STYLES.map(
    (name) => `<link href="/cdn/shop/t/8/assets/${name}.css" media="all" rel="stylesheet" type="text/css"/>`,
  ).join('\n');
  return out.replace('</head>', `${links}\n</head>`);
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
