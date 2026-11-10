# Feature Specification: Gestión del catálogo e imágenes

**Feature Branch**: `003-catalog-management`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "El administrador carga y edita productos, variantes (color/talle),
precios, stock, colecciones e imágenes. Las imágenes se guardan en el backend. El catálogo inicial
se importa desde la tienda Radian original."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Crear y editar productos con variantes (Priority: P1)

Como administrador quiero crear un producto con título, descripción, tipo, materiales, precio,
precio anterior opcional y variantes por color y talle con su SKU y stock.

**Why this priority**: sin productos no hay tienda.

**Independent Test**: crear un producto con 2 colores × 3 talles desde el panel y verlo en el
listado de administración con sus 6 variantes.

**Acceptance Scenarios**:

1. **Given** datos válidos, **When** creo el producto, **Then** queda en estado borrador con sus
   variantes y un identificador legible (slug) único derivado del título.
2. **Given** dos variantes con la misma combinación color/talle o el mismo SKU, **When** guardo,
   **Then** se rechaza indicando el conflicto.
3. **Given** un precio anterior menor o igual al precio, **When** guardo, **Then** se rechaza.
4. **Given** un producto existente, **When** lo edita otro administrador al mismo tiempo,
   **Then** el segundo guardado se rechaza por conflicto de versión en lugar de pisar cambios.

---

### User Story 2 - Subir y ordenar imágenes (Priority: P1)

Como administrador quiero subir imágenes del producto, asociarlas opcionalmente a un color, definir
su orden y texto alternativo, y que la tienda las sirva en varios tamaños.

**Why this priority**: la tienda es de moda; sin imágenes no se vende.

**Independent Test**: subir 3 imágenes, reordenarlas, y pedir cada una en distintos anchos.

**Acceptance Scenarios**:

1. **Given** una imagen JPEG, PNG o WebP de hasta 10 MB, **When** la subo, **Then** se guarda en el
   backend y queda disponible en anchos 320, 640, 960, 1280 y 1920 (sin agrandar el original).
2. **Given** un archivo que no es imagen aunque tenga extensión de imagen, **When** lo subo,
   **Then** se rechaza.
3. **Given** un producto con imágenes, **When** cambio el orden, **Then** la primera pasa a ser la
   imagen principal.
4. **Given** una imagen, **When** la elimino, **Then** deja de mostrarse en la tienda.

---

### User Story 3 - Publicar, despublicar y gestionar stock (Priority: P1)

Como administrador quiero publicar productos para que aparezcan en la tienda, despublicarlos, y
ajustar el stock de cada variante.

**Independent Test**: publicar un producto en borrador y verificar que aparece en el catálogo
público; ajustar stock a 0 y verificar que figura agotado.

**Acceptance Scenarios**:

1. **Given** un producto sin imágenes o sin variantes, **When** intento publicarlo, **Then** se
   rechaza con el motivo.
2. **Given** un producto publicado, **When** lo despublico, **Then** desaparece del catálogo
   público en menos de 2 segundos.
3. **Given** un ajuste de stock que dejaría cantidad negativa, **When** lo aplico, **Then** se
   rechaza.

---

### User Story 4 - Colecciones (Priority: P2)

Como administrador quiero agrupar productos en colecciones (por ejemplo "Tops", "Footwear",
"Leathers") con título, descripción, imagen y orden manual de productos.

**Independent Test**: crear una colección, asignarle 4 productos, reordenarlos y ver el orden en la
tienda.

**Acceptance Scenarios**:

1. **Given** una colección, **When** agrego un producto ya incluido, **Then** no se duplica.
2. **Given** una colección con productos, **When** borro un producto del catálogo, **Then** deja de
   figurar en la colección.

---

### User Story 5 - Importar el catálogo inicial (Priority: P2)

Como dueño quiero que una instalación nueva tenga el catálogo de la tienda Radian original
(productos, variantes, precios, colecciones e imágenes) para que la demo se vea completa.

**Independent Test**: en una base vacía ejecutar la importación y ver ~40 productos publicados con
imágenes; ejecutarla de nuevo no duplica nada.

**Acceptance Scenarios**:

1. **Given** una base vacía, **When** ejecuto la importación, **Then** se crean los productos,
   colecciones e imágenes usando los mismos casos de uso que el panel.
2. **Given** una importación ya hecha, **When** la ejecuto de nuevo, **Then** no se crean
   duplicados.

### Edge Cases

- Slug repetido: se agrega un sufijo numérico (`blazer`, `blazer-2`).
- Producto con pedidos asociados: se archiva en lugar de borrarse físicamente.
- Subida interrumpida o archivo vacío: se rechaza sin dejar archivos huérfanos.
- Imagen con metadatos EXIF (ubicación): se eliminan al procesarla.
- Precios: siempre en centavos enteros y una única moneda (USD) para evitar errores de redondeo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Solo administradores DEBEN poder ejecutar operaciones de gestión del catálogo.
- **FR-002**: Un producto DEBE tener título (2–120), slug único, descripción, tipo (categoría),
  materiales, etiquetas, precio en centavos > 0, precio anterior opcional > precio, estado
  (`draft`, `published`, `archived`) y versión para control de concurrencia optimista.
- **FR-003**: Una variante DEBE tener SKU único global, color, talle, stock ≥ 0 y precio propio
  opcional; la combinación color+talle es única dentro del producto.
- **FR-004**: El sistema DEBE aceptar imágenes JPEG/PNG/WebP de hasta 10 MB validando el contenido
  real del archivo, eliminar metadatos, generar versiones WebP en anchos estándar y persistirlas en
  el almacenamiento del backend.
- **FR-005**: Las imágenes DEBEN tener orden, texto alternativo (obligatorio para publicar) y color
  asociado opcional; la primera es la principal.
- **FR-006**: Publicar DEBE exigir al menos una variante y una imagen.
- **FR-007**: Los ajustes de stock DEBEN registrar motivo y nunca dejar stock negativo.
- **FR-008**: El sistema DEBE gestionar colecciones con slug único, título, descripción, imagen y
  lista ordenada de productos sin duplicados.
- **FR-009**: Todo cambio del catálogo DEBE emitir eventos que actualicen el modelo de lectura e
  invaliden la caché de las consultas afectadas en menos de 2 segundos.
- **FR-010**: El sistema DEBE incluir una importación idempotente del catálogo original usando los
  mismos casos de uso del panel.
- **FR-011**: La web DEBE incluir un panel de administración para listar, crear, editar, publicar,
  subir imágenes, ajustar stock y gestionar colecciones.
- **FR-012**: Las imágenes servidas DEBEN poder cachearse indefinidamente por navegadores y
  proxies (URLs versionadas).

### Key Entities

- **Product** (agregado): datos comerciales, estado, versión, variantes e imágenes.
- **Variant**: SKU, color, talle, stock, precio opcional.
- **ProductImage**: referencia al archivo almacenado, alt, orden, color opcional, dimensiones.
- **Collection** (agregado): slug, título, descripción, imagen, productos ordenados.
- **StoredMedia**: archivo original y derivados en el almacenamiento del backend, tipo, tamaño,
  hash de contenido.
- **StockAdjustment**: variante, delta, motivo, fecha, autor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un administrador crea y publica un producto con 6 variantes y 3 imágenes en menos de
  4 minutos.
- **SC-002**: Los cambios publicados son visibles en la tienda en menos de 2 segundos en el p95.
- **SC-003**: La importación inicial termina en menos de 3 minutos y repetida no genera duplicados.
- **SC-004**: El 100 % de los archivos no-imagen se rechazan.

## Assumptions

- Una sola moneda (USD) y un solo idioma de contenido de producto (el de la tienda original;
  la interfaz está en español).
- No hay importación masiva por CSV en esta versión.
- El almacenamiento de imágenes es el disco del backend (volumen persistente) detrás de un puerto
  que permitiría cambiarlo por un almacenamiento de objetos.
