# Feature Specification: Checkout y pedidos

**Feature Branch**: `006-checkout-orders`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "El cliente confirma la compra con dirección de envío, método de envío
y pago (simulado). Se descuenta stock, se crea el pedido y el cliente ve su historial. El
administrador ve y gestiona los pedidos."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Confirmar la compra (Priority: P1)

Como comprador quiero completar email, dirección de envío, elegir método de envío y pagar con
tarjeta, y recibir una confirmación con número de pedido.

**Why this priority**: es el objetivo de toda la tienda.

**Independent Test**: con un carrito de 2 líneas, completar el checkout con una tarjeta de prueba
aprobada y ver la página de confirmación; el stock baja y el carrito queda vacío.

**Acceptance Scenarios**:

1. **Given** un carrito válido y datos completos, **When** confirmo con una tarjeta aprobada,
   **Then** se crea el pedido en estado "pagado", se descuenta el stock y veo el número de pedido.
2. **Given** una tarjeta rechazada, **When** confirmo, **Then** veo el motivo, el pedido no queda
   pagado, el stock reservado se libera y puedo reintentar.
3. **Given** que entre que armé el carrito y pagué se agotó una variante, **When** confirmo,
   **Then** se rechaza indicando qué línea no tiene stock y no se cobra nada.
4. **Given** un doble clic en "Pagar" (o un reintento por red), **When** llegan dos pedidos
   idénticos, **Then** se crea un único pedido y un único cobro.

---

### User Story 2 - Envío, descuentos y totales (Priority: P2)

Como comprador quiero elegir envío estándar (gratis desde US$ 150, si no US$ 10) o exprés
(US$ 25) y aplicar un código de descuento, viendo el desglose antes de pagar.

**Independent Test**: un carrito de US$ 120 muestra envío estándar US$ 10; aplicar el código
`WELCOME20` descuenta 20 % del subtotal.

**Acceptance Scenarios**:

1. **Given** un subtotal ≥ US$ 150, **When** elijo envío estándar, **Then** el envío es gratis.
2. **Given** un código válido y vigente, **When** lo aplico, **Then** veo el descuento en el
   desglose.
3. **Given** un código inexistente, vencido o ya usado por mí (si es de un solo uso), **When** lo
   aplico, **Then** veo el motivo del rechazo.

---

### User Story 3 - Historial de pedidos (Priority: P2)

Como cliente quiero ver mis pedidos con estado, fecha, total y detalle.

**Independent Test**: tras comprar, abrir "Mis pedidos" y ver el pedido con su detalle.

**Acceptance Scenarios**:

1. **Given** pedidos realizados, **When** abro "Mis pedidos", **Then** los veo del más reciente al
   más antiguo.
2. **Given** un pedido de otro cliente, **When** intento verlo, **Then** recibo "no encontrado".

---

### User Story 4 - Gestión de pedidos (administrador) (Priority: P2)

Como administrador quiero listar pedidos filtrando por estado, ver el detalle y marcarlos como
enviados (con código de seguimiento) o cancelarlos.

**Independent Test**: marcar un pedido pagado como enviado y verificar el estado en el historial
del cliente; cancelar otro y verificar que el stock vuelve.

**Acceptance Scenarios**:

1. **Given** un pedido pagado, **When** lo marco enviado con seguimiento, **Then** pasa a "enviado"
   y el cliente lo ve.
2. **Given** un pedido pagado no enviado, **When** lo cancelo, **Then** pasa a "cancelado",
   se reintegra (simulado) y el stock se repone.
3. **Given** un pedido enviado, **When** intento cancelarlo, **Then** se rechaza.

---

### User Story 5 - Compra como invitado (Priority: P3)

Como visitante quiero comprar sin crear cuenta, solo con mi email.

**Independent Test**: completar una compra sin sesión y ver la confirmación.

**Acceptance Scenarios**:

1. **Given** un visitante con carrito, **When** completa el checkout con email, **Then** el pedido
   se crea asociado a ese email.

### Edge Cases

- Dos compradores compran la última unidad a la vez: solo uno lo consigue, el otro recibe "sin
  stock" sin cobro.
- La pasarela de pago no responde a tiempo: el pedido queda "pago pendiente" con la reserva
  activa 15 minutos; al vencer se libera el stock y se cancela.
- Precio cambiado entre el carrito y el pago: se usa el precio vigente y se avisa antes de cobrar.
- Montos siempre en centavos; el redondeo del descuento es hacia abajo a nivel centavo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Confirmar un pedido DEBE ser una operación idempotente identificada por una clave
  enviada por el cliente.
- **FR-002**: Al confirmar, el sistema DEBE recalcular precios vigentes, validar stock y
  **reservarlo** de forma atómica para todas las líneas, o rechazar todo sin reservar nada.
- **FR-003**: El pago DEBE procesarse mediante una pasarela simulada con tarjetas de prueba
  (aprobada, rechazada, timeout) detrás de un puerto intercambiable; nunca se almacenan datos de
  tarjeta, solo los últimos 4 dígitos y la marca.
- **FR-004**: Estados del pedido: `pending_payment` → `paid` → `shipped`; `pending_payment` →
  `cancelled` (pago rechazado o reserva vencida); `paid` → `cancelled` (por administrador, con
  reintegro simulado y reposición de stock). Transiciones inválidas se rechazan.
- **FR-005**: Las reservas sin pago confirmado DEBEN liberarse a los 15 minutos.
- **FR-006**: Envío: estándar US$ 10 (gratis desde US$ 150 de subtotal con descuento aplicado) y
  exprés US$ 25.
- **FR-007**: Códigos de descuento por porcentaje o monto fijo, con vigencia, mínimo de compra
  opcional y uso único por email opcional; el sistema trae `WELCOME20` (20 %, un uso por email).
- **FR-008**: El pedido DEBE guardar una foto inmutable de las líneas (título, variante, imagen,
  precio), dirección, envío, descuento y totales.
- **FR-009**: Tras el pago, el carrito del comprador DEBE vaciarse.
- **FR-010**: Clientes ven solo sus pedidos; administradores ven todos con filtros por estado y
  fecha, paginados.
- **FR-011**: Las ventas DEBEN actualizar el ranking de "más vendidos" del catálogo de lectura.
- **FR-012**: La web DEBE ofrecer checkout en una página con validación por campo, resumen del
  pedido, página de confirmación, "Mis pedidos" y gestión de pedidos en administración.

### Key Entities

- **Order** (agregado): número legible, comprador (cliente o email), líneas, dirección, envío,
  descuento, totales, estado, pagos, historial de estados, versión.
- **StockReservation**: variante, cantidad, pedido, vencimiento, estado.
- **Payment**: proveedor, referencia, monto, estado, últimos 4, marca.
- **DiscountCode**: código, tipo, valor, vigencia, mínimo, uso único por email, usos.
- **OrderSummary / OrderDetail** (lectura): vistas para historial y administración.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un comprador completa el checkout en menos de 2 minutos.
- **SC-002**: Con 50 compras concurrentes de la última unidad, se vende exactamente 1 (0 sobreventa).
- **SC-003**: 0 pedidos o cobros duplicados ante reintentos con la misma clave.
- **SC-004**: El 100 % de las reservas vencidas se liberan en menos de 1 minuto del vencimiento.

## Assumptions

- El pago es simulado (proyecto de portafolio); no se integra un procesador real.
- No se envían emails transaccionales; la confirmación se muestra en pantalla y en el historial.
- Impuestos incluidos en el precio; no se calculan aparte.
- Envíos solo con las dos tarifas fijas indicadas, sin cálculo por destino.
