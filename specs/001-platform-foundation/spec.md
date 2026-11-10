# Feature Specification: Plataforma base, salud y observabilidad

**Feature Branch**: `001-platform-foundation`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "Base de la tienda Radian: backend y frontend en un mismo repositorio,
dos bases de datos (escritura y lectura), caché, pools de conexiones monitoreados, health checks y
visibilidad en Grafana."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Levantar el entorno completo con un solo comando (Priority: P1)

Como desarrollador (o reclutador que evalúa el proyecto) quiero clonar el repositorio y levantar
todo el sistema (API, web, bases, caché, monitoreo) con un único comando y ver una página de inicio
funcionando.

**Why this priority**: sin entorno reproducible ninguna otra feature puede probarse ni mostrarse.

**Independent Test**: en una máquina limpia con Docker, ejecutar el comando de arranque y abrir la
web, la API y Grafana.

**Acceptance Scenarios**:

1. **Given** un clon limpio del repositorio, **When** se ejecuta el comando de arranque,
   **Then** en menos de 3 minutos responden la web, la API y Grafana.
2. **Given** el entorno levantado, **When** se ejecuta la suite de tests, **Then** todas las pruebas
   pasan sin configuración manual adicional.

---

### User Story 2 - Consultar la salud del sistema (Priority: P1)

Como operador quiero consultar si el servicio está vivo y si está listo para atender tráfico, con
el estado de cada dependencia, para que un orquestador o un balanceador decida si enviarle pedidos.

**Why this priority**: es el contrato mínimo de operabilidad y lo pidió explícitamente el negocio.

**Independent Test**: consultar los endpoints de salud con todas las dependencias arriba y luego
deteniendo cada una.

**Acceptance Scenarios**:

1. **Given** todas las dependencias disponibles, **When** se consulta la disponibilidad,
   **Then** responde "listo" con el estado y la latencia de cada componente.
2. **Given** la base de escritura caída, **When** se consulta la disponibilidad,
   **Then** responde "no listo" indicando qué componente falla, y la consulta de "vivo" sigue OK.
3. **Given** la caché caída, **When** se consulta la disponibilidad, **Then** responde "degradado"
   (listo para atender) y lo informa.
4. **Given** el sincronizador de lecturas atrasado más allá del umbral, **When** se consulta la
   disponibilidad, **Then** responde "degradado" con el atraso medido.

---

### User Story 3 - Ver el comportamiento del sistema en dashboards (Priority: P2)

Como operador quiero dashboards ya armados con tráfico, errores, latencias, uso de los pools de
conexiones, efectividad de la caché y atraso de la sincronización de lecturas.

**Why this priority**: da visibilidad real; depende de que existan las métricas (US2/US4).

**Independent Test**: generar tráfico y verificar que los paneles muestran datos sin configurar
nada a mano.

**Acceptance Scenarios**:

1. **Given** el entorno levantado, **When** se abre Grafana, **Then** existe un dashboard
   "Radian Store" con paneles poblados sin pasos manuales.
2. **Given** tráfico con errores forzados, **When** se mira el dashboard, **Then** la tasa de
   errores refleja el aumento en menos de 30 segundos.

---

### User Story 4 - Pools de conexiones monitoreados (Priority: P2)

Como operador quiero que el acceso a cada base pase por un pool con límites y que el sistema avise
cuando el pool se satura o las conexiones tardan en obtenerse.

**Why this priority**: evita caídas por agotamiento de conexiones y lo hace visible.

**Independent Test**: generar más pedidos concurrentes que conexiones disponibles y verificar
métricas, avisos y que ninguna petición quede colgada indefinidamente.

**Acceptance Scenarios**:

1. **Given** un pool de tamaño N, **When** llegan más de N operaciones concurrentes,
   **Then** las excedentes esperan en cola y se publica la cantidad en espera.
2. **Given** saturación sostenida por encima del umbral, **When** pasa el período de muestreo,
   **Then** se registra un aviso estructurado con el pool afectado.
3. **Given** una operación que no consigue conexión dentro del tiempo máximo, **When** vence,
   **Then** falla con un error controlado (servicio no disponible) en lugar de colgarse.

---

### User Story 5 - Errores y trazabilidad consistentes (Priority: P3)

Como desarrollador quiero que todo error devuelva un formato estándar y que cada pedido tenga un
identificador que aparezca en todos los logs relacionados.

**Independent Test**: provocar un error de validación y uno inesperado; verificar formato y que el
identificador aparece en la respuesta y en los logs.

**Acceptance Scenarios**:

1. **Given** un pedido con datos inválidos, **When** se procesa, **Then** responde 400 con un cuerpo
   de error estándar que detalla los campos.
2. **Given** un error inesperado, **When** ocurre, **Then** responde 500 sin filtrar detalles
   internos y el log incluye el identificador del pedido y la causa.

### Edge Cases

- Una dependencia arranca después que la API: la API debe arrancar igual y reportar "no listo"
  hasta que la dependencia responda.
- Apagado ordenado: al recibir la señal de apagado, se dejan de aceptar pedidos nuevos, se terminan
  los en curso (máx. 10 s) y se cierran los pools.
- Configuración inválida (variable faltante o fuera de rango): el proceso no arranca y explica qué
  variable está mal.
- El chequeo de salud nunca debe tardar más de 2 s aunque una dependencia no responda.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El repositorio DEBE contener la API, la web y los contratos compartidos, y levantar
  todo el entorno local con un único comando.
- **FR-002**: El sistema DEBE usar dos bases de datos independientes: una de escritura (fuente de
  verdad) y una de lectura (modelos para consulta), cada una con su propio historial de migraciones.
- **FR-003**: El sistema DEBE proveer una infraestructura de mensajería interna (outbox) que
  garantice que todo cambio confirmado en la base de escritura se refleje en la de lectura al menos
  una vez, en orden por agregado y de forma idempotente.
- **FR-004**: El sistema DEBE exponer un chequeo de "vivo" que solo depende del proceso.
- **FR-005**: El sistema DEBE exponer un chequeo de "listo" con estado global (`ok`, `degraded`,
  `down`) y por componente (base de escritura, base de lectura, caché, sincronizador), con latencia
  medida y tiempo límite de 2 s.
- **FR-006**: El sistema DEBE exponer métricas en formato Prometheus: pedidos HTTP (cantidad,
  errores, latencia por ruta), pools (total, en uso, libres, en espera, tiempo de adquisición,
  timeouts), caché (aciertos, fallos, errores), outbox (pendientes) y atraso de sincronización.
- **FR-007**: Cada base DEBE accederse solo mediante un pool con tamaño máximo, tiempo máximo de
  espera de conexión, tiempo de inactividad y tiempo máximo por sentencia configurables.
- **FR-008**: Un monitor DEBE muestrear los pools periódicamente y registrar un aviso cuando la
  saturación (en uso / máximo) o la cola de espera superen umbrales configurables durante 3
  muestras seguidas, y otro aviso cuando se recupera.
- **FR-009**: El sistema DEBE proveer una caché compartida con política cache-aside, TTL e
  invalidación por etiquetas; si la caché falla, las operaciones continúan contra la base.
- **FR-010**: Todos los errores DEBEN responderse en formato `problem+json` con código, título,
  detalle seguro e identificador del pedido.
- **FR-011**: Todos los logs DEBEN ser JSON estructurado e incluir el identificador del pedido.
- **FR-012**: La configuración DEBE validarse al arrancar; si es inválida el proceso termina con
  un mensaje claro.
- **FR-013**: El sistema DEBE apagarse ordenadamente cerrando pools, caché y sincronizador.
- **FR-014**: Prometheus y Grafana DEBEN venir configurados como código (datasource, scrape y
  dashboard) sin pasos manuales.
- **FR-015**: La web DEBE tener una estructura base (layout, ruteo, cliente HTTP, capa de servicios
  y React Query configurado) y mostrar el estado del backend en una página de diagnóstico.
- **FR-016**: Un pipeline de integración continua DEBE ejecutar typecheck, lint, chequeo de
  arquitectura, tests y build en cada push.

### Key Entities

- **Outbox Event**: cambio de dominio confirmado pendiente de proyectar (tipo, agregado,
  versión, datos, fecha, estado de procesamiento).
- **Projection Checkpoint**: registro, en la base de lectura, de qué eventos ya se aplicaron
  (garantiza idempotencia).
- **Health Report**: estado global, estado y latencia por componente, versión y uptime.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un clon limpio queda funcionando en menos de 3 minutos con un solo comando.
- **SC-002**: El chequeo de "listo" responde en menos de 2 s en el 100 % de los casos, incluso con
  dependencias caídas.
- **SC-003**: Con tráfico 3 veces mayor a la capacidad del pool, el 0 % de los pedidos queda
  colgado: todos responden o fallan dentro del tiempo máximo configurado.
- **SC-004**: El dashboard muestra datos de todos los paneles dentro de los 30 s posteriores al
  primer tráfico.
- **SC-005**: Un cambio confirmado en escritura aparece en lectura en menos de 1 s en el p95 en
  condiciones normales.

## Assumptions

- El entorno de evaluación tiene Docker y Node.js 24 disponibles.
- No se requiere alta disponibilidad multi-nodo; una instancia por servicio.
- Las alertas se expresan como logs y paneles; no se integra un sistema de paging externo.
- El sincronizador corre dentro del mismo proceso de la API pero es separable (punto de entrada
  propio).
