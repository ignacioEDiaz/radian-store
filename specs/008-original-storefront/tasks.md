---
description: "Task list for 008-original-storefront"
---

# Tasks: Frontend original del tema conectado al backend

**Tests**: OBLIGATORIOS (TDD).

## Phase 1: La portada vuelve a ser la original

- [x] T001 Copiar el documento y los archivos del tema a `apps/web/theme` y `apps/web/public`
- [x] T002 [P] Test `theme/shell.test.ts`: la home conserva secciones, estilos y scripts del tema; solo se quitan scripts de terceros
- [x] T003 `theme/shell.ts` + `theme/vite-plugin.ts` (dev: middleware; build: `index.html` y `app.html`)
- [x] T004 Verificación visual contra el clon estático (mismas posiciones de scroll)

## Phase 2: Catálogo completo

- [x] T005 [P] Test de integración: el importador conserva el handle original como slug (productos y colecciones)
- [x] T006 `slug` opcional en `createProduct` / `collections.create`; el importador lo usa
- [x] T007 Extractor: catálogo completo desde el product finder (41 productos, colecciones reales), stock en las variantes que ofrece la portada, mapa de variantes del tema

## Phase 3: Puente tema ⇄ backend

- [x] T008 [P] Tests `theme-bridge/themeBackend.test.ts`: rutas de carrito, errores, sección del drawer, búsqueda predictiva, mapa de variantes, puente de `fetch`
- [x] T009 `variants`, `ajaxCart`, `cartDrawerSection`, `themeBackend`, `fetchBridge`
- [x] T010 [P] Tests `theme-bridge/dom.test.ts`: cuenta, vista rápida, selector de país, newsletter
- [x] T011 `dom`, `themeApi`, `index` (caché de React Query → drawer y contador del tema)
- [x] T012 Umbral de envío gratis en `@radian/contracts` + test que lo ata al dominio

## Phase 4: Páginas internas dentro del marco del tema

- [x] T013 [P] Tests del shell `app`: marco conservado, header interno, estilos de producto, traductor fuera de React
- [x] T014 `theme-ui` (tarjeta, precio, íconos, animaciones) y estilos acotados a `.app-root`
- [x] T015 [P] Tests `CollectionPage`, `ProductPage`, `CartPage`
- [x] T016 Colección/búsqueda (filtros, orden, cargar más), producto (galería, variantes, alta al carrito), página de carrito
- [x] T017 Rutas con las URLs del tema; redirecciones desde las rutas anteriores; quitar header/footer/drawer de React
- [x] T018 Cuenta: acceso al panel para staff y cierre de sesión

## Phase 5: Polish

- [x] T019 E2E: portada original sin errores, look del hero al carrito, compra completa, buscador, cuenta demo
- [x] T020 nginx (home / app / archivos del tema), Docker, README, capturas
