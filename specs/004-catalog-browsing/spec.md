# Feature Specification: Navegación del catálogo (tienda)

**Feature Branch**: `004-catalog-browsing`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "Los visitantes recorren la tienda: inicio, colecciones con filtros y
orden, búsqueda y página de producto. Las consultas costosas se cachean."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver el listado de una colección con filtros (Priority: P1)

Como visitante quiero ver los productos de una colección (o todos) con imagen, nombre, precio,
precio anterior y colores disponibles, y filtrar por talle, color, material, rango de precio y
disponibilidad, ordenando por novedad, precio o destacados.

**Why this priority**: es el recorrido principal de compra.

**Independent Test**: abrir "Todos", filtrar por color "Obsidian Black" y talle "M", ordenar por
precio ascendente y verificar resultados y contadores.

**Acceptance Scenarios**:

1. **Given** una colección publicada, **When** la abro, **Then** veo 24 productos por página con
   la cantidad total y paginación.
2. **Given** filtros aplicados, **When** veo las facetas, **Then** cada opción muestra cuántos
   productos quedarían al elegirla.
3. **Given** filtros y orden elegidos, **When** comparto o recargo la URL, **Then** se mantienen.
4. **Given** un producto sin stock en todas sus variantes, **When** aparece en el listado,
   **Then** se marca "Agotado".

---

### User Story 2 - Ver el detalle de un producto (Priority: P1)

Como visitante quiero ver la galería, descripción, precio, selector de color y talle con
disponibilidad por combinación, y productos relacionados.

**Independent Test**: abrir un producto, cambiar de color y ver que la galería y la disponibilidad
de talles se actualizan.

**Acceptance Scenarios**:

1. **Given** un producto publicado, **When** lo abro por su slug, **Then** veo toda su información.
2. **Given** un color seleccionado, **When** cambio de color, **Then** la galería muestra primero
   las imágenes de ese color y los talles sin stock aparecen deshabilitados.
3. **Given** un slug inexistente o despublicado, **When** lo abro, **Then** veo una página
   "producto no encontrado" con enlace al catálogo.

---

### User Story 3 - Buscar productos (Priority: P2)

Como visitante quiero buscar por texto (nombre, tipo, material, color) con sugerencias mientras
escribo.

**Independent Test**: escribir "leather" y ver sugerencias en menos de 300 ms tras dejar de
escribir; enviar la búsqueda y ver la página de resultados con filtros.

**Acceptance Scenarios**:

1. **Given** un texto con al menos 2 caracteres, **When** escribo, **Then** veo hasta 6
   sugerencias de productos y colecciones.
2. **Given** una búsqueda sin resultados, **When** la envío, **Then** veo un mensaje y productos
   destacados como alternativa.
3. **Given** errores de tipeo leves ("leathr"), **When** busco, **Then** aparecen resultados
   relevantes.

---

### User Story 4 - Página de inicio (Priority: P2)

Como visitante quiero una portada con hero, colecciones destacadas, novedades y más vendidos, con
la estética oscura de la marca.

**Independent Test**: abrir la portada y verificar secciones pobladas con datos reales del
catálogo.

**Acceptance Scenarios**:

1. **Given** el catálogo importado, **When** abro la portada, **Then** veo hero, colecciones
   destacadas, "Novedades" (últimos publicados) y "Destacados".

---

### User Story 5 - Respuestas rápidas gracias a la caché (Priority: P2)

Como visitante quiero que listados, búsquedas y fichas carguen rápido aunque haya mucho tráfico;
como dueño quiero que un cambio en el catálogo no deje datos viejos visibles más de 2 segundos.

**Independent Test**: medir el tiempo de una consulta de listado repetida y verificar en métricas
que la segunda es acierto de caché; modificar el precio y verificar que el listado lo refleja.

**Acceptance Scenarios**:

1. **Given** una consulta ya realizada, **When** se repite, **Then** se resuelve desde caché.
2. **Given** un cambio de precio, **When** se proyecta, **Then** las consultas afectadas se
   invalidan y el próximo pedido trae el precio nuevo.
3. **Given** la caché caída, **When** navego, **Then** la tienda sigue funcionando (más lenta).

### Edge Cases

- Página fuera de rango: devuelve lista vacía con el total correcto (no error).
- Parámetros de filtro desconocidos o inválidos: se ignoran los desconocidos y se informa 400 para
  valores inválidos (p. ej. precio mínimo > máximo).
- Muchas combinaciones de filtros: la caché tiene límite de memoria y política de expulsión.
- Producto despublicado que estaba en caché: no debe seguir apareciendo pasados 2 segundos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Todas las consultas de esta feature DEBEN resolverse contra el modelo de lectura.
- **FR-002**: El listado DEBE soportar colección, filtros (talle, color, material, tipo, rango de
  precio, disponibilidad), orden (destacados, novedades, precio asc/desc) y paginación de 24.
- **FR-003**: El listado DEBE devolver facetas con conteos calculados sobre el resultado filtrado
  (excluyendo el propio filtro de cada faceta).
- **FR-004**: El detalle DEBE incluir galería ordenada (con anchos disponibles por imagen), matriz
  de disponibilidad color×talle, precios y hasta 8 relacionados (misma colección o tipo).
- **FR-005**: La búsqueda DEBE ser tolerante a errores leves y ordenar por relevancia; las
  sugerencias responden con hasta 6 resultados.
- **FR-006**: Listados, facetas, búsqueda, detalle, colecciones y portada DEBEN cachearse con
  invalidación por eventos del catálogo; la caché no es requisito para funcionar.
- **FR-007**: Las respuestas públicas DEBEN incluir validadores HTTP (ETag) para permitir
  respuestas 304.
- **FR-008**: La web DEBE reflejar filtros, orden y página en la URL, precargar la siguiente
  página y mostrar estados de carga (skeleton), vacío y error con reintento.
- **FR-009**: Las imágenes DEBEN cargarse en el ancho adecuado al dispositivo (srcset) y en
  diferido fuera de la primera pantalla.

### Key Entities

- **ProductCard** (lectura): slug, título, precios, imagen principal y secundaria, colores,
  talles disponibles, agotado, fecha de publicación, posición destacada.
- **ProductDetail** (lectura): todo lo anterior más descripción, galería, variantes con stock,
  materiales, relacionados.
- **CollectionView** (lectura): slug, título, descripción, imagen, productos en orden.
- **SearchDocument** (lectura): texto indexable por producto.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Listados y fichas responden en menos de 150 ms en el p95 con caché caliente y menos
  de 500 ms con caché fría, sobre el catálogo importado.
- **SC-002**: Al menos 80 % de aciertos de caché en una navegación simulada típica.
- **SC-003**: Las sugerencias de búsqueda aparecen en menos de 300 ms tras dejar de escribir.
- **SC-004**: Ningún dato desactualizado se muestra más de 2 segundos después de un cambio.

## Assumptions

- No hay personalización por usuario en el catálogo (precios iguales para todos).
- Los "más vendidos" se basan en una posición destacada definida por el administrador hasta que
  existan pedidos; luego se combinan con ventas reales (feature 006).
- Interfaz en español; contenido de productos en el idioma original.
