# Feature Specification: Carrito de compras

**Feature Branch**: `005-shopping-cart`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "Los visitantes y clientes agregan variantes al carrito, cambian
cantidades y lo ven en un panel lateral. El carrito persiste en el backend."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agregar al carrito (Priority: P1)

Como visitante quiero agregar una variante (color + talle) al carrito desde la ficha del producto y
ver el panel del carrito abierto con el total actualizado.

**Why this priority**: sin carrito no hay compra.

**Independent Test**: agregar dos variantes distintas y una repetida; verificar líneas, cantidades
y total.

**Acceptance Scenarios**:

1. **Given** una variante con stock, **When** la agrego, **Then** aparece en el carrito con
   cantidad 1 y el contador del encabezado se actualiza al instante.
2. **Given** la misma variante ya en el carrito, **When** la agrego otra vez, **Then** se suma a la
   misma línea.
3. **Given** una variante sin stock suficiente, **When** intento agregarla, **Then** veo "solo
   quedan N unidades" y no se supera el stock.
4. **Given** un producto despublicado, **When** intento agregarlo, **Then** se rechaza.

---

### User Story 2 - Modificar el carrito (Priority: P1)

Como comprador quiero cambiar cantidades (1–10 por línea) y quitar líneas.

**Independent Test**: cambiar una cantidad a 3, quitar otra línea y verificar totales.

**Acceptance Scenarios**:

1. **Given** una línea, **When** cambio la cantidad, **Then** el subtotal y el total se recalculan.
2. **Given** una línea, **When** la quito, **Then** desaparece y, si era la última, veo el carrito
   vacío con un enlace para seguir comprando.
3. **Given** una cantidad mayor a 10, **When** la envío, **Then** se rechaza.

---

### User Story 3 - El carrito persiste (Priority: P1)

Como visitante quiero que mi carrito se conserve al cerrar el navegador; como cliente quiero que al
iniciar sesión mi carrito de visitante se combine con el de mi cuenta.

**Independent Test**: armar un carrito como visitante, cerrar y abrir el navegador (sigue);
iniciar sesión con una cuenta que ya tenía un carrito y verificar la combinación.

**Acceptance Scenarios**:

1. **Given** un carrito de visitante, **When** vuelvo dentro de 30 días, **Then** sigue igual.
2. **Given** un carrito de visitante y otro en mi cuenta, **When** inicio sesión, **Then** se
   combinan sumando cantidades de variantes repetidas (respetando stock y máximo por línea).

---

### User Story 4 - Precios y disponibilidad actualizados (Priority: P2)

Como comprador quiero ver si cambió el precio o se agotó algo de mi carrito antes de pagar.

**Independent Test**: con un producto en el carrito, cambiar su precio desde administración y
reabrir el carrito.

**Acceptance Scenarios**:

1. **Given** un precio cambiado, **When** abro el carrito, **Then** veo el precio nuevo y un aviso.
2. **Given** una variante agotada, **When** abro el carrito, **Then** la línea se marca no
   disponible y no cuenta en el total.

### Edge Cases

- Dos pestañas modificando el mismo carrito: la última operación gana sin corromper líneas
  (operaciones atómicas por línea).
- Carrito de visitante con identificador inválido o expirado: se crea uno nuevo sin error visible.
- Máximo 50 líneas por carrito.
- El total se calcula siempre en el backend; el frontend no es fuente de verdad del precio.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El carrito DEBE persistirse en el backend e identificarse con una credencial de
  visitante (cookie de 30 días) o con la cuenta del cliente.
- **FR-002**: El sistema DEBE permitir agregar, cambiar cantidad (1–10) y quitar líneas; máximo 50
  líneas.
- **FR-003**: Agregar o aumentar cantidad DEBE validar que el producto esté publicado y que haya
  stock suficiente (sin reservarlo).
- **FR-004**: Cada comando DEBE devolver el carrito resultante completo (líneas, subtotales, total,
  avisos) para que la interfaz se actualice sin esperar la sincronización de lecturas.
- **FR-005**: Al iniciar sesión, el carrito de visitante DEBE combinarse con el del cliente.
- **FR-006**: La consulta del carrito DEBE reflejar precios y disponibilidad vigentes y marcar
  cambios respecto de lo agregado.
- **FR-007**: La web DEBE mostrar un panel lateral de carrito, contador en el encabezado y
  actualizaciones optimistas con reversión si el backend rechaza.

### Key Entities

- **Cart** (agregado): identificador, dueño (visitante o cliente), líneas, fecha de actualización,
  versión.
- **CartLine**: variante, producto, cantidad, precio unitario al agregar.
- **CartView** (lectura): líneas con título, imagen, color, talle, precio vigente, disponibilidad,
  avisos y totales.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El contador del carrito se actualiza en menos de 100 ms percibidos tras "Agregar".
- **SC-002**: El 100 % de los totales mostrados coinciden con los calculados por el backend.
- **SC-003**: La combinación de carritos al iniciar sesión no pierde ninguna línea.

## Assumptions

- El carrito no reserva stock; la reserva ocurre al confirmar el pedido (feature 006).
- Los carritos de visitante inactivos por más de 30 días se eliminan con una tarea periódica.
