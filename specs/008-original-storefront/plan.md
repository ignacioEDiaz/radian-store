# Implementation Plan: Frontend original del tema conectado al backend

**Branch**: `008-original-storefront` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

## Summary

El documento original del tema vuelve a ser el HTML de la web. React deja de dibujar el marco
(header, footer, carrito) y se limita a (a) conectar el tema con el backend y (b) renderizar las
páginas internas dentro del `<main>` del tema.

```
apps/web/
├── theme/
│   ├── home.original.html   documento del tema, sin tocar (fuente de verdad)
│   ├── shell.ts             original → `home` (tal cual) | `app` (marco + raíz de React)
│   └── vite-plugin.ts       sirve/emite esos documentos sin pasar por el transformador de Vite
├── public/cdn, public/_hosts  archivos del tema (estilos, scripts, imágenes, videos)
└── src/
    ├── entries/home.tsx     portada: solo instala el puente
    ├── entries/app.tsx      páginas internas: puente + router
    ├── theme-bridge/        tema ⇄ backend
    └── theme-ui/            componentes React con el markup del tema
```

## Constitution Check

| Principio | Cumplimiento |
|-----------|--------------|
| I. TDD | tests del shell (qué se conserva / qué se quita), del puente (rutas de carrito y búsqueda, sección del drawer, mapa de variantes), de las páginas y e2e de compra |
| II. DDD / III. CQRS | sin cambios en el modelo; única extensión: `slug` opcional al crear producto/colección para conservar el handle original |
| VII. Capa de servicios | el puente no llama a `fetch`: traduce los pedidos del tema a `cartService` / `catalogService` |
| Contratos tipados | el umbral de envío gratis se publica en `@radian/contracts` y un test lo ata a la regla de dominio |

**Result**: PASS.

## Diseño

### Documento (`theme/shell.ts`)

- `home`: el original menos scripts de terceros identificados por marcadores (analítica, pixels,
  Shop Pay/login, perf-kit). Un test compara el markup resultante con el original.
- `app`: mismo marco con `<main>` reemplazado por `#root`, la variante de header de página interna
  (sin transparencia, logo oscuro), los estilos del tema para colección/producto/búsqueda y el
  traductor en vivo acotado para que no entre a React.

### Puente (`src/theme-bridge`)

El tema fue escrito contra la API Ajax de Shopify. En vez de modificarlo, se le da lo que espera:

- `fetchBridge`: intercepta `fetch` del mismo origen y deriva a `themeBackend` los pedidos del tema
  (`/cart/add|change|update|clear`, `/cart.js`, `?section_id=<drawer>`, `/search/suggest`).
- `themeBackend`: resuelve cada pedido con los services y responde en el formato del tema,
  incluida la sección HTML del drawer (`cartDrawerSection`, mismo markup que el original).
- `variants` + `shopify-variants.json`: id de variante del tema → (producto, color, talle) →
  variante real. El mapa lo genera `tools/extract-radian-catalog.ts`.
- `index`: la caché de React Query es la fuente de verdad del carrito; cada cambio confirmado por
  el servidor se vuelca en el drawer y el contador con las funciones del propio tema.
- `dom`: cuenta, vista rápida, selector de país y newsletter → pantallas propias o sin efecto.

### Páginas

- Colección / búsqueda / producto: markup y clases del tema (`theme-ui`), comportamiento en React
  (filtros en la URL, "cargar más" con `useInfiniteQuery`, selector de variantes, alta al carrito
  por el camino del tema para conservar sus animaciones).
- Cuenta, checkout, pedidos, administración, estado: mismas pantallas, reestilizadas con los
  tokens del tema dentro de `.app-root`.

### Catálogo

- El extractor toma el catálogo completo del "product finder" de la portada: 41 productos con sus
  colecciones reales; los slugs son los handles originales.
- Las variantes que la portada ofrece como disponibles tienen stock en la semilla.

## Riesgos conocidos

- El tema asume disponibilidad estática; el stock real lo decide el backend (se valida antes de
  agregar y el tema muestra el motivo).
- `vendor-gsap` y la vista rápida no venían en el clon: los efectos que dependían de ellos tampoco
  funcionaban antes.
