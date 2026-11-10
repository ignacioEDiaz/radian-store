# Feature Specification: Cuentas de clientes y administradores

**Feature Branch**: `002-customer-accounts`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "Los clientes pueden registrarse, iniciar sesión y ver su perfil; existe
un rol administrador que gestiona el catálogo."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrarse (Priority: P1)

Como visitante quiero crear una cuenta con nombre, email y contraseña para guardar mi carrito y ver
mis pedidos.

**Why this priority**: es la puerta de entrada al resto de funciones personalizadas.

**Independent Test**: registrar una cuenta nueva y quedar con la sesión iniciada.

**Acceptance Scenarios**:

1. **Given** un email no registrado, **When** completo el formulario con datos válidos,
   **Then** se crea la cuenta y quedo con la sesión iniciada.
2. **Given** un email ya registrado, **When** intento registrarme, **Then** veo un mensaje que
   indica que el email está en uso (sin revelar otros datos).
3. **Given** una contraseña débil (menos de 10 caracteres), **When** envío el formulario,
   **Then** veo el requisito incumplido junto al campo.

---

### User Story 2 - Iniciar y cerrar sesión (Priority: P1)

Como cliente registrado quiero iniciar sesión con email y contraseña y cerrarla cuando quiera.

**Why this priority**: sin sesión no hay pedidos asociados a la persona ni panel de administración.

**Independent Test**: iniciar sesión con credenciales válidas, recargar la página y seguir
autenticado; cerrar sesión y verificar que el acceso privado se niega.

**Acceptance Scenarios**:

1. **Given** credenciales válidas, **When** inicio sesión, **Then** accedo a "Mi cuenta".
2. **Given** credenciales inválidas, **When** inicio sesión, **Then** veo un mensaje genérico
   ("email o contraseña incorrectos").
3. **Given** 5 intentos fallidos en 15 minutos desde el mismo origen para el mismo email,
   **When** intento de nuevo, **Then** se bloquea temporalmente con un mensaje claro.
4. **Given** una sesión iniciada, **When** cierro sesión, **Then** las páginas privadas me piden
   iniciar sesión.

---

### User Story 3 - Ver y editar mi perfil (Priority: P2)

Como cliente quiero ver mis datos y actualizar mi nombre y mi dirección de envío predeterminada.

**Independent Test**: editar el nombre y la dirección, recargar y verificar que persisten.

**Acceptance Scenarios**:

1. **Given** una sesión iniciada, **When** abro "Mi cuenta", **Then** veo nombre, email y
   dirección predeterminada.
2. **Given** una dirección con campos obligatorios vacíos, **When** la guardo, **Then** veo qué
   campos faltan.

---

### User Story 4 - Rol administrador (Priority: P1)

Como dueño de la tienda quiero que exista una cuenta administradora inicial y que solo los
administradores accedan a la gestión del catálogo.

**Independent Test**: iniciar sesión con la cuenta admin inicial y acceder a la sección de
administración; con una cuenta de cliente, el acceso se niega.

**Acceptance Scenarios**:

1. **Given** el sistema recién instalado, **When** arranca, **Then** existe una cuenta
   administradora con las credenciales definidas en la configuración.
2. **Given** un cliente autenticado, **When** intenta una operación de administración,
   **Then** se niega con "prohibido".
3. **Given** un visitante sin sesión, **When** intenta una operación privada, **Then** se niega con
   "no autenticado".

### Edge Cases

- Emails con mayúsculas o espacios: se normalizan (minúsculas, sin espacios) antes de comparar.
- Sesión expirada: el cliente vuelve a ver la web como visitante sin errores en pantalla.
- Cambio de rol o desactivación de cuenta: la siguiente operación privada se rechaza aunque la
  sesión no haya expirado.
- Registro concurrente con el mismo email: solo uno tiene éxito.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir registrar cuentas con nombre (2–80 caracteres), email válido
  y único (normalizado) y contraseña de al menos 10 caracteres.
- **FR-002**: Las contraseñas DEBEN almacenarse solo como hash con un algoritmo resistente a fuerza
  bruta; nunca se registran en logs.
- **FR-003**: El sistema DEBE permitir iniciar sesión y mantenerla mediante una credencial no
  accesible desde scripts del navegador, con expiración de 7 días.
- **FR-004**: El sistema DEBE limitar los intentos fallidos de inicio de sesión (5 cada 15 minutos
  por email y origen).
- **FR-005**: El sistema DEBE permitir cerrar sesión invalidando la credencial en el navegador.
- **FR-006**: Los clientes DEBEN poder consultar y editar nombre y dirección de envío
  predeterminada (nombre del destinatario, calle, ciudad, provincia/estado, código postal, país,
  teléfono).
- **FR-007**: El sistema DEBE soportar los roles `customer` y `admin`, y crear al iniciar la cuenta
  admin definida por configuración si no existe.
- **FR-008**: Toda operación privada DEBE verificar sesión (401 si falta) y rol (403 si no
  alcanza), y verificar que la cuenta siga activa.
- **FR-009**: El registro DEBE publicar el evento "cliente registrado" para que otras partes del
  sistema (perfil de lectura, carrito) reaccionen.
- **FR-010**: La web DEBE ofrecer páginas de registro, inicio de sesión y "Mi cuenta", y mostrar en
  el encabezado el estado de la sesión.

### Key Entities

- **Customer (Account)**: identificador, email normalizado, nombre, hash de contraseña, rol,
  estado (activa/desactivada), dirección predeterminada, fechas de alta y modificación.
- **Address** (value object): destinatario, calle, ciudad, región, código postal, país (ISO-2),
  teléfono.
- **Customer Profile** (lectura): vista para "Mi cuenta" sin datos sensibles.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un visitante completa el registro en menos de 1 minuto.
- **SC-002**: El 100 % de las operaciones privadas sin sesión o sin rol se rechazan (verificado por
  tests de contrato sobre cada endpoint privado).
- **SC-003**: Ninguna contraseña ni hash aparece en logs ni en respuestas.
- **SC-004**: El sexto intento fallido dentro de la ventana se bloquea el 100 % de las veces.

## Assumptions

- No hay recuperación de contraseña por email ni verificación de email en esta versión (no hay
  servidor de correo); queda fuera de alcance.
- No hay inicio de sesión con redes sociales.
- Un único administrador inicial es suficiente; la gestión de más administradores queda fuera.
