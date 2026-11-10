---
description: "Task list for 007-admin-viewer-role"
---

# Tasks: Rol de solo lectura para el panel

**Tests**: OBLIGATORIOS (TDD).

## Phase 1: Backend

- [x] T001 [P] Test unit dominio: `Customer.changeRole` (emite evento solo si cambia) y `EnsureStaffAccount` para admin y viewer
- [x] T002 Implementar rol `viewer` (contrato, dominio, migración 0008, config, arranque)
- [x] T003 [P] Test contrato `admin-area-guard.test.ts`: GET permitido a viewer; POST/PUT/PATCH/DELETE → 403 `READ_ONLY_ACCOUNT` con mensaje; cliente → 403 FORBIDDEN; sin sesión → 401
- [x] T004 Implementar `requireAdminArea` y usarlo en todas las rutas admin
- [x] T005 [P] Test integración: recorre TODAS las rutas de modificación registradas bajo `/api/admin` con viewer → 403, y verifica que los datos no cambiaron; pedidos enmascarados para viewer
- [x] T006 Implementar enmascarado de pedidos para viewer

## Phase 2: Web

- [x] T007 [P] Tests web: viewer ve "Admin" en el header y entra al panel; banner de solo lectura; diálogo con la explicación ante una mutación rechazada; el login muestra la cuenta demo cuando está configurada
- [x] T008 Implementar `isStaff/isReadOnly`, `RequireAdmin`, `ReadOnlyBanner`, `ReadOnlyDialog` (MutationCache), hint en login

## Phase 3: Polish

- [x] T009 Config de compose/.env.example, README, suite completa y e2e con la cuenta viewer
