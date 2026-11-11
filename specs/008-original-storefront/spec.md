# Feature Specification: Frontend original del tema conectado al backend

**Feature Branch**: `008-original-storefront`

**Created**: 2026-11-10

**Status**: Implemented

**Input**: User description: "El frontend tenía que quedar como estaba. Dejalo idéntico a como
estaba antes, con todas las animaciones, y mantené la funcionalidad desde el backend."

## Contexto

Las features 004–007 construyeron una interfaz nueva (oscura, propia) que reemplazó el diseño de
la tienda clonada. Eso no era lo pedido: el diseño original es un requisito, y el trabajo del
proyecto es el backend y la integración. Esta feature corrige el rumbo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - La portada es la original (Priority: P1)

Como dueño del proyecto quiero que la portada sea exactamente la de la tienda clonada: mismas
secciones, estilos, tipografías, videos y animaciones.

**Independent Test**: comparar capturas de la portada servida por la aplicación contra el clon
estático en las mismas posiciones de scroll.

**Acceptance Scenarios**:

1. **Given** la portada, **When** la abro, **Then** veo las 25 secciones originales en su orden,
   con el header, los menús y el footer originales.
2. **Given** la portada, **When** hago scroll, **Then** las animaciones del tema funcionan y no hay
   errores de JavaScript ni archivos del tema faltantes.

---

### User Story 2 - Lo que la portada ofrece se puede comprar (Priority: P1)

Como visitante quiero que los controles de la portada (bolsa, "agregar todo al carrito", producto
destacado, conjunto, buscador, links a productos y colecciones) funcionen contra el backend.

**Acceptance Scenarios**:

1. **Given** la portada, **When** agrego el look del hero, **Then** el drawer original se abre con
   los productos y totales que devuelve el servidor, y el contador del header se actualiza.
2. **Given** productos en el carrito, **When** recargo o cambio de página, **Then** siguen ahí.
3. **Given** un link a un producto o colección del tema, **When** lo sigo, **Then** llego a una
   página real del catálogo con el mismo diseño.
4. **Given** el buscador del tema, **When** escribo, **Then** sugiere productos del catálogo.

---

### User Story 3 - Las pantallas nuevas hablan el mismo idioma visual (Priority: P2)

Como visitante quiero que colección, producto, búsqueda, carrito, checkout, cuenta, pedidos,
administración y estado se vean como parte de la misma tienda.

**Acceptance Scenarios**:

1. **Given** una página interna, **When** la abro, **Then** conserva el header, los menús, el
   carrito y el footer originales.
2. **Given** colección, producto o búsqueda, **When** las abro, **Then** usan el markup y los
   estilos del propio tema (tarjetas, filtros, galería, selector de variantes).

### Edge Cases

- Una variante que la portada muestra como disponible pero no tiene stock: el servidor decide; el
  tema muestra el motivo y un conjunto nunca queda agregado a medias.
- Un producto del tema que no existe en el catálogo: página de "no encontrado" con el mismo marco.
- Controles que dependían de servicios de Shopify (vista rápida, cuenta, selector de país,
  newsletter): llevan a la pantalla equivalente o quedan sin efecto, sin errores.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La portada DEBE servirse desde el documento original del tema sin modificar su
  markup, estilos ni scripts. Solo se quitan scripts de terceros invisibles (analítica, pixels,
  login de Shop) que apuntan a servicios inexistentes.
- **FR-002**: Las llamadas del tema a la API de carrito y búsqueda DEBEN responderse con datos del
  backend propio, a través de la capa de services.
- **FR-003**: El carrito DEBE tener una única fuente de verdad en el cliente (caché de React
  Query) reflejada en el drawer y el contador del tema.
- **FR-004**: Las URLs del catálogo DEBEN coincidir con las del tema (`/collections/:slug`,
  `/products/:slug`, `/search`).
- **FR-005**: El catálogo semilla DEBE incluir todos los productos enlazados desde la portada, con
  el mismo identificador (handle) que usa el tema.
- **FR-006**: Las pantallas propias NO DEBEN alterar el marco del tema: sus estilos quedan
  acotados a la raíz de React.
- **FR-007**: El traductor en vivo del documento NO DEBE modificar contenido de React (p. ej.
  emails de pedidos).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Capturas de la portada vs. el clon estático: alrededor de 1 % de píxeles distintos
  como máximo por captura (movimiento de marquesinas y videos). Medido: 0 a 1,06 % en 12 capturas.
- **SC-002**: 0 errores de JavaScript y 0 archivos del tema faltantes al cargar la portada, salvo
  los que ya faltaban en el clon original.
- **SC-003**: Compra completa (catálogo → producto → drawer del tema → checkout → confirmación) en
  desktop y mobile.
- **SC-004**: 100 % de los ids de variante que usa la portada resuelven a una variante del catálogo.

## Assumptions

- Las páginas de contenido editorial (nosotros, contacto, blog) no forman parte del alcance: se
  muestran con un texto de marcador dentro del mismo marco.
- La "vista rápida" del tema dependía de un render de Shopify que el clon no incluye: lleva a la
  ficha del producto.
