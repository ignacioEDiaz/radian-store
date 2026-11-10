# Research: Checkout y pedidos

## Reserva de stock sin sobreventa

- **Decision**: `UPDATE inventory_items SET reserved = reserved + $q WHERE variant_id = $v AND
  on_hand - reserved >= $q RETURNING ...`, una sentencia por línea dentro de la transacción, en
  orden de `variant_id`.
- **Rationale**: atómico a nivel fila (el lock de la fila serializa compradores de la misma
  variante sin bloquear las demás); el orden fijo evita deadlocks entre pedidos multi-línea.
- **Alternatives**: `SELECT … FOR UPDATE` + verificación en código (dos round-trips, mismo
  resultado), aislamiento SERIALIZABLE (reintentos frecuentes bajo carga).

## Idempotencia

- **Decision**: tabla `idempotency_keys` con hash del request y respuesta almacenada (24 h).
- **Rationale**: patrón estándar de APIs de pago; protege contra doble clic y reintentos de red.

## Pago

- **Decision**: `FakePaymentGateway` con tarjetas de prueba documentadas detrás del puerto
  `PaymentGateway`.
- **Rationale**: proyecto de portafolio; el puerto permite un adaptador real (tokenización del
  lado del cliente) sin tocar el dominio.

## Consistencia entre pedido, stock y pago

- **Decision**: saga en dos transacciones con estado `pending_payment`, reserva con vencimiento y
  job de expiración.
- **Alternatives**: 2PC (no aplicable a un proveedor de pago externo).

## Descuentos

- **Decision**: agregado `DiscountCode` con redenciones por email (`UNIQUE(code_id, email)`) para
  los de uso único; seed `WELCOME20`.
