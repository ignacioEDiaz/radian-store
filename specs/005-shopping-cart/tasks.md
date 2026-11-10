---
description: "Task list for 005-shopping-cart"
---

# Tasks: Carrito de compras

**Input**: `/specs/005-shopping-cart/` · **Tests**: OBLIGATORIOS (TDD).

## Phase 1: Setup

- [x] T001 [P] Contratos `packages/contracts/src/cart.ts`
- [x] T002 [P] Migraciones write `0006_carts.ts`, read `0005_cart_snapshots.ts`

## Phase 2: Foundational

- [x] T003 [P] Tests unit `test/unit/cart/domain/cart.test.ts`: agregar/sumar, límites 10 y 50, stock acumulado, producto no publicado, cambiar cantidad, quitar, merge con límites, eventos con snapshot
- [x] T004 Implementar `modules/cart/domain/*`
- [x] T005 [P] Test integración `test/integration/cart/pg-catalog-availability.test.ts` (lee write-db de catalog/inventory)
- [x] T006 Implementar `pg-catalog-availability.ts`
- [x] T007 [P] Test integración `test/integration/cart/pg-cart-repository.test.ts`: guardar/cargar por id y por cliente, conflicto de versión, outbox
- [x] T008 Implementar `pg-cart-repository.ts`
- [x] T009 [P] Test integración `cart-projection.test.ts` + `get-cart.test.ts` (precio vigente, avisos, agotados)
- [x] T010 Implementar proyección, `pg-cart-read-model.ts`, `get-cart.ts`, `cart-view-builder.ts`
- [x] T011 [P] Test contrato `test/contract/cart/cart-identity.test.ts`: emite `rs_cart` firmada, cookie adulterada → carrito nuevo, sesión prevalece

## Phase 3: User Story 1 - Agregar (P1) 🎯

- [x] T012 [P] [US1] Test unit `add-item.test.ts` (fakes; reintento ante conflicto)
- [x] T013 [P] [US1] Test contrato `cart-items.test.ts` POST: 200, 422 variantes, 404
- [x] T014 [US1] Implementar `add-item.ts`, `cart-identity.ts`, rutas
- [x] T015 [P] [US1] Tests web `useAddToCart.test.tsx` (optimista + rollback) y `CartDrawer.test.tsx`; botón "Agregar" en `ProductPage`
- [x] T016 [US1] Implementar `cartService`, `useCart`, `useAddToCart`, `CartDrawerContext`, `CartDrawer`, `CartButton`, integración en `ProductPage` y header

## Phase 4: User Story 2 - Modificar (P1)

- [x] T017 [P] [US2] Tests unit `change-quantity.test.ts`, `remove-line.test.ts`; contrato PATCH/DELETE
- [x] T018 [US2] Implementar comandos y rutas
- [x] T019 [P] [US2] Test web `CartLineItem.test.tsx` (stepper 1–10, quitar, carrito vacío)
- [x] T020 [US2] Implementar `useUpdateCartLine`, `useRemoveCartLine`, `CartLineItem`, estado vacío

## Phase 5: User Story 3 - Persistencia y merge (P1)

- [x] T021 [P] [US3] Test unit `merge-guest-cart.test.ts`; test contrato login con `rs_cart` combina y expira cookie
- [x] T022 [US3] Implementar `merge-guest-cart.ts`, puerto `CartMerger` y su invocación desde login/registro
- [x] T023 [P] [US3] Test integración `guest-cart-expiry.test.ts` (reloj falso, 30 días)
- [x] T024 [US3] Implementar `expire-guest-carts.ts` y job horario (se detiene en el apagado ordenado)

## Phase 6: User Story 4 - Precios y disponibilidad vigentes (P2)

- [x] T025 [P] [US4] Test integración: cambio de precio y agotamiento reflejados con avisos en `GET /api/cart`; test web de avisos en el drawer
- [x] T026 [US4] Ajustes en read model y `CartLineItem` hasta pasar T025

## Phase 7: Polish

- [x] T027 Métrica `cart_operations_total` + panel
- [x] T028 Suite completa, lint, typecheck, arch; validar quickstart

## Dependencies

001–004 completas. Foundational → US1 → US2 → US3 → US4.
