import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { buildShell, type ShellKind } from './shell.ts';

const ORIGINAL = path.join(import.meta.dirname, 'home.original.html');
const ENTRIES: Record<ShellKind, string> = { home: 'src/entries/home.tsx', app: 'src/entries/app.tsx' };

/** Rutas que nunca son un documento de la web (API, archivos del tema, internos de Vite). */
const NOT_A_PAGE = /^\/(api|media|health|metrics|cdn|_hosts|src|node_modules|assets|@)|\.[a-z0-9]+$/i;

export const shellFor = (pathname: string): ShellKind => (pathname === '/' || pathname === '/index.html' ? 'home' : 'app');

interface OutputChunkLike {
  type: 'chunk';
  fileName: string;
  name: string;
  isEntry: boolean;
  imports: string[];
  viteMetadata?: { importedCss?: Set<string> };
}

/**
 * Sirve el documento original del tema como HTML de la web (sin pasarlo por el transformador de
 * HTML de Vite, para no alterarlo) e inyecta el bundle de React: en desarrollo vía middleware y en
 * el build emitiendo `index.html` (home) y `app.html` (páginas internas).
 */
export function themeShell(): Plugin {
  const original = () => readFileSync(ORIGINAL, 'utf8');

  return {
    name: 'radian:theme-shell',

    config: () => ({ build: { rollupOptions: { input: { ...ENTRIES } } } }),

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '/').split('?')[0] ?? '/';
        const wantsHtml = req.method === 'GET' && (req.headers.accept ?? '').includes('text/html');
        if (!wantsHtml || NOT_A_PAGE.test(pathname)) return next();
        const kind = shellFor(pathname);
        const stub = `<!doctype html><html><head></head><body><script type="module" src="/${ENTRIES[kind]}"></script></body></html>`;
        server
          .transformIndexHtml(req.url ?? '/', stub)
          .then((dev) => {
            const head = /<head>([\s\S]*)<\/head>/.exec(dev)?.[1] ?? '';
            const body = /<body>([\s\S]*)<\/body>/.exec(dev)?.[1] ?? '';
            res.statusCode = 200;
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.setHeader('cache-control', 'no-cache');
            res.end(buildShell(original(), kind, { head, body }));
          })
          .catch(next);
      });
    },

    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((c): c is typeof c & OutputChunkLike => c.type === 'chunk');
      const byFile = new Map(chunks.map((c) => [c.fileName, c]));
      for (const kind of Object.keys(ENTRIES) as ShellKind[]) {
        const entry = chunks.find((c) => c.isEntry && c.name === kind);
        if (!entry) throw new Error(`Falta el entry "${kind}" en el bundle`);
        const seen = new Set<string>();
        const css = new Set<string>();
        const walk = (file: string) => {
          if (seen.has(file)) return;
          seen.add(file);
          const chunk = byFile.get(file);
          if (!chunk) return;
          chunk.viteMetadata?.importedCss?.forEach((f) => css.add(f));
          chunk.imports.forEach(walk);
        };
        walk(entry.fileName);
        seen.delete(entry.fileName);
        const head = [
          ...[...css].map((f) => `<link rel="stylesheet" href="/${f}">`),
          ...[...seen].map((f) => `<link rel="modulepreload" href="/${f}">`),
        ].join('\n');
        const body = `<script type="module" src="/${entry.fileName}"></script>`;
        this.emitFile({
          type: 'asset',
          fileName: kind === 'home' ? 'index.html' : 'app.html',
          source: buildShell(original(), kind, { head, body }),
        });
      }
    },
  };
}
