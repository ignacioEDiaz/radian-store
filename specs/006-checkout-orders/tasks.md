---
description: "Task list for 006-checkout-orders"
---

# Tasks: Checkout y pedidos

**Input**: `/specs/006-checkout-orders/` · **Tests**: OBLIGATORIOS (TDD).

## Phase 1: Setup

- [ ] T001 [P] Contratos `packages/contracts/src/ordering.ts`
- [ ] T002 [P] Migraciones write `0007_ordering.ts` (incluye seed de `WELCOME20` y secuencia), read `0006_orders_read.ts`

## Phase 2: Foundational (dominio)

- [ ] T003 [P] Tests unit `test/unit/ordering/domain/pricing-calculator.test.ts`: envío gratis en el umbral exacto, exprés, redondeo del descuento, fijo mayor al subtotal → tope
- [ ] T004 [P] Tests unit `test/unit/ordering/domain/discount-code.test.ts`: vigencia, mínimo, uso único
- [ ] T005 [P] Tests unit `test/unit/ordering/domain/order.test.ts`: transiciones válidas/ inválidas, historial, eventos con snapshot
- [ ] T006 Implementar `modules/ordering/domain/*`
- [ ] T007 [P] Test unit `test/unit/ordering/infrastructure/fake-payment-gateway.test.ts`: Luhn, vencimiento, tarjetas de prueba, timeout, refund
- [ ] T008 Implementar `fake-payment-gateway.ts`
- [ ] T009 [P] Test integración `test/integration/inventory/pg-stock-reservations.test.ts`: reserva todo-o-nada, commit, release, restock, **50 reservas concurrentes de la última unidad → 1 éxito**, sin deadlocks con pedidos multi-línea cruzados
- [ ] T010 Implementar `inventory/infrastructure/pg-stock-reservations.ts` + eventos de inventario y su proyección a `catalog_variants`
- [ ] T011 [P] Test integración `test/integration/ordering/pg-idempotency-store.test.ts`: dos inserts simultáneos con la misma clave → uno gana
- [ ] T012 Implementar repositorios de ordering, idempotency store y generador de número

## Phase 3: User Story 1 - Confirmar la compra (P1) 🎯

- [ ] T013 [P] [US1] Tests unit `test/unit/ordering/application/place-order.test.ts` (fakes): aprobado, rechazado (libera), timeout (queda pendiente), sin stock (no cobra), precio cambiado (409), idempotencia (misma respuesta), carrito vacío
- [ ] T014 [US1] Implementar `place-order.ts` y `quote-checkout.ts` + adaptadores `checkout-cart-source` y `catalog-pricing` (write-db)
- [ ] T015 [P] [US1] Test integración `test/integration/ordering/place-order.test.ts` de punta a punta con bases reales: stock descontado, outbox, proyección del pedido, carrito vaciado por la política
- [ ] T016 [P] [US1] Test contrato `test/contract/ordering/checkout.test.ts`: 201/402/202/409/422, header `Idempotency-Key` obligatorio, redacción de tarjeta en logs
- [ ] T017 [US1] Rutas `checkout-routes.ts`, política `clear-cart-on-order-paid.ts`, proyecciones `order-projection.ts` y `sales-count-projection.ts`
- [ ] T018 [P] [US1] Tests web `CheckoutPage.test.tsx` (validación por campo, prefill desde perfil, doble clic → una sola request, errores 402/422/409 mostrados), `OrderConfirmationPage.test.tsx`
- [ ] T019 [US1] Implementar `checkoutService`, `useCheckoutQuote`, `usePlaceOrder` (clave de idempotencia estable por intento), secciones y páginas; botón "Finalizar compra" en el drawer

## Phase 4: User Story 2 - Envío, descuentos y totales (P2)

- [ ] T020 [P] [US2] Test contrato `quote.test.ts`: umbral de envío, `WELCOME20`, códigos inválidos con motivo
- [ ] T021 [US2] Ajustes en `quote-checkout.ts`; componentes `ShippingMethodSection`, `DiscountCodeField`, `OrderSummary` con tests web

## Phase 5: User Story 3 - Historial (P2)

- [ ] T022 [P] [US3] Test integración `list-my-orders.test.ts`/`get-my-order.test.ts` (read-db; aislamiento por cliente) y contrato `orders.test.ts`
- [ ] T023 [US3] Implementar queries y `order-routes.ts`
- [ ] T024 [P] [US3] Tests web `OrdersPage.test.tsx`, `OrderDetailPage.test.tsx`
- [ ] T025 [US3] Implementar `ordersService`, hooks y páginas en `/cuenta/pedidos`

## Phase 6: User Story 4 - Gestión admin (P2)

- [ ] T026 [P] [US4] Tests unit `ship-order.test.ts`, `cancel-order.test.ts` (refund + restock) y contrato `admin-orders.test.ts`
- [ ] T027 [US4] Implementar comandos, queries admin y `admin-order-routes.ts`
- [ ] T028 [P] [US4] Tests web `AdminOrdersPage.test.tsx`, `AdminOrderDetailPage.test.tsx`
- [ ] T029 [US4] Implementar `features/admin-orders`

## Phase 7: User Story 5 - Invitado (P3)

- [ ] T030 [P] [US5] Test contrato: compra sin sesión con email; sin email → 400
- [ ] T031 [US5] Ajustes en `place-order.ts` y en `CheckoutPage` (campo email visible para invitados)

## Phase 8: Expiración y robustez

- [ ] T032 [P] Test integración `pending-order-expiry.test.ts` (reloj falso): vence a los 15 min, libera stock, cancela
- [ ] T033 Implementar `expire-pending-orders.ts` + job (cada 30 s)
- [ ] T034 Script `verify:oversell` (50 compras concurrentes contra la API levantada)

## Phase 9: Polish

- [ ] T035 Métricas de pedidos/pagos/reservas + paneles en Grafana
- [ ] T036 Test e2e Playwright `apps/web/e2e/purchase.spec.ts`: navegar → agregar → checkout → confirmación → historial
- [ ] T037 Suite completa, lint, typecheck, arch; validar quickstart; actualizar README con el flujo de compra y capturas

## Dependencies

001–005 completas. Foundational → US1 → US2 → US3 → US4 → US5 → Expiración → Polish.
