# Feature Specification: Rol de solo lectura para el panel de administración

**Feature Branch**: `007-admin-viewer-role`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Un usuario intermedio que pueda ver todas las funciones del admin pero
que no pueda modificar nada, por seguridad. Cuando intente hacer algo, un mensaje explica por qué
no puede."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recorrer el panel en modo lectura (Priority: P1)

Como visitante evaluando el proyecto (p. ej. una persona de recursos humanos) quiero ingresar con
una cuenta de demostración y recorrer el panel de administración completo (productos, variantes,
stock, imágenes, colecciones, pedidos) sin riesgo de romper nada.

**Why this priority**: es el objetivo de la feature: mostrar el panel sin entregar permisos.

**Independent Test**: ingresar con la cuenta de solo lectura y abrir cada sección del panel.

**Acceptance Scenarios**:

1. **Given** la cuenta de solo lectura, **When** ingreso, **Then** veo el acceso "Admin" y puedo
   abrir todas las secciones del panel.
2. **Given** el panel abierto con esa cuenta, **When** miro cualquier pantalla, **Then** un aviso
   permanente indica que estoy en modo solo lectura.

---

### User Story 2 - Intentar modificar y entender por qué no se puede (Priority: P1)

Como usuario de solo lectura quiero que, si intento crear, editar, publicar, subir, ajustar stock,
enviar o cancelar, aparezca un mensaje claro que explique que la cuenta es de solo lectura y por
qué existe esa restricción.

**Independent Test**: con la cuenta de solo lectura intentar cada tipo de acción y verificar el
mensaje y que nada cambió.

**Acceptance Scenarios**:

1. **Given** la cuenta de solo lectura, **When** intento cualquier modificación, **Then** veo un
   mensaje explicando que es una cuenta de demostración de solo lectura y que la restricción
   protege los datos de la tienda.
2. **Given** ese intento, **When** reviso los datos, **Then** no cambió nada.
3. **Given** alguien que salta la interfaz y llama a la API directamente, **When** envía una
   modificación, **Then** el servidor la rechaza con el mismo motivo.

---

### User Story 3 - Proteger datos personales (Priority: P2)

Como dueño de la tienda quiero que la cuenta de solo lectura no vea datos personales completos de
los clientes (email, teléfono, dirección) en los pedidos.

**Acceptance Scenarios**:

1. **Given** la cuenta de solo lectura, **When** abro un pedido, **Then** email, teléfono y
   dirección aparecen enmascarados; productos, totales y estados se ven completos.

### Edge Cases

- La cuenta de solo lectura no puede convertirse en administradora por sí misma.
- Las operaciones de comprador (carrito, checkout, su propio perfil) siguen funcionando para esa
  cuenta: la restricción aplica solo al panel de administración.
- Si se le quita el rol, la restricción aplica en la siguiente operación (mismo mecanismo que admin).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE soportar el rol `viewer` además de `customer` y `admin`.
- **FR-002**: Toda operación de lectura del panel de administración DEBE permitirse a `admin` y
  `viewer`.
- **FR-003**: Toda operación de modificación del panel DEBE rechazarse para `viewer` con un error
  propio (403 `READ_ONLY_ACCOUNT`) y un mensaje explicativo; la verificación DEBE hacerse en el
  servidor.
- **FR-004**: La cuenta de solo lectura DEBE crearse al iniciar si está configurada (como el admin).
- **FR-005**: La web DEBE mostrar un aviso permanente de modo lectura en el panel y, ante un
  intento de modificación, un mensaje modal con la explicación.
- **FR-006**: Los pedidos vistos por `viewer` DEBEN enmascarar email, teléfono y dirección.
- **FR-007**: La pantalla de ingreso PUEDE mostrar las credenciales de la cuenta demo (configurable).

### Key Entities

- **Role**: `customer` | `admin` | `viewer`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de las rutas de modificación del panel rechazan a `viewer` (test de contrato
  que recorre todas las rutas registradas bajo `/api/admin` y `/api/admin/media`).
- **SC-002**: 0 cambios en los datos tras intentos de modificación con `viewer`.
- **SC-003**: Ningún email ni teléfono completo de cliente visible para `viewer`.

## Assumptions

- Una sola cuenta de solo lectura configurada por entorno es suficiente (demo pública).
- Ver imágenes (`/media/*`) y la tienda sigue siendo público.
