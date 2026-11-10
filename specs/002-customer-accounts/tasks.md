---
description: "Task list for 002-customer-accounts"
---

# Tasks: Cuentas de clientes y administradores

**Input**: `/specs/002-customer-accounts/` · **Tests**: OBLIGATORIOS (TDD).

## Phase 1: Setup

- [x] T001 Agregar dependencias `@node-rs/argon2`, `jose`, `@fastify/cookie` a `apps/api`
- [x] T002 [P] Contratos `packages/contracts/src/identity.ts` (Address, Profile, Register, Login, UpdateProfile)
- [x] T003 [P] Migraciones `migrations/write/0002_customers.ts` y `migrations/read/0002_customer_profiles.ts`

## Phase 2: Foundational

- [x] T004 [P] Tests unit `test/unit/identity/domain/{email,address,customer}.test.ts`: normalización y validación, eventos emitidos, desactivación
- [x] T005 Implementar `modules/identity/domain/*`
- [x] T006 [P] Test integración `test/integration/identity/pg-customer-repository.test.ts`: guardar, buscar por email, conflicto de versión, email duplicado → `ConflictError`, outbox escrito en la misma transacción
- [x] T007 Implementar `infrastructure/persistence/pg-customer-repository.ts`
- [x] T008 [P] Test integración `test/integration/identity/customer-profile-projection.test.ts`: eventos → `customer_profiles`, idempotencia
- [x] T009 Implementar `infrastructure/projections/customer-profile-projection.ts` y registrarla
- [x] T010 [P] Tests unit `test/unit/identity/security/{argon2-password-hasher,jwt-token-issuer,login-rate-limiter}.test.ts`
- [x] T011 Implementar `infrastructure/security/*`
- [x] T012 [P] Test contrato `test/contract/identity/auth-guard.test.ts`: 401 sin cookie, 401 token inválido/expirado, 401 cuenta desactivada, 403 rol insuficiente
- [x] T013 Implementar `infrastructure/http/auth-guard.ts` (requireAuth, requireRole) y verificación de `Origin`

## Phase 3: User Story 1 - Registro (P1) 🎯

- [x] T014 [P] [US1] Test unit `test/unit/identity/application/register-customer.test.ts` (repo en memoria, hasher falso, reloj fijo)
- [x] T015 [P] [US1] Test contrato `test/contract/identity/register.test.ts`: 201 + cookie, 409, 400 contraseña corta, la respuesta no contiene hash
- [x] T016 [US1] Implementar `application/commands/register-customer.ts` y ruta `POST /api/auth/register`
- [x] T017 [P] [US1] Test web `features/account/pages/RegisterPage.test.tsx` (MSW): validación por campo, error de email en uso, redirección a `/cuenta`
- [x] T018 [US1] Implementar `authService.register`, `useRegister`, `RegisterForm`, `RegisterPage`

## Phase 4: User Story 2 - Login/Logout (P1)

- [x] T019 [P] [US2] Test unit `application/authenticate.test.ts`: credenciales válidas, inválidas (mensaje genérico), cuenta desactivada, bloqueo tras 5 fallos
- [x] T020 [P] [US2] Test contrato `test/contract/identity/login.test.ts`: 200 + cookie, 401, 429 con `Retry-After`, logout 204
- [x] T021 [US2] Implementar `authenticate.ts`, rutas login/logout
- [x] T022 [P] [US2] Test web `LoginPage.test.tsx` y `Header` muestra sesión (`useSession` con 401 → visitante)
- [x] T023 [US2] Implementar `authService.login/logout/me`, `useSession`, `useLogin`, `useLogout`, `LoginPage`, estado de sesión en el header

## Phase 5: User Story 4 - Rol administrador (P1)

- [x] T024 [P] [US4] Test unit `ensure-admin.test.ts`: crea si no existe, no duplica, promueve a admin si existía como cliente
- [x] T025 [US4] Implementar `ensure-admin.ts` y llamada en `main.ts`
- [x] T026 [P] [US4] Test web `RequireAdmin.test.tsx` y `RequireAuth.test.tsx`
- [x] T027 [US4] Implementar `RequireAuth`, `RequireAdmin` y layout `/admin` vacío protegido

## Phase 6: User Story 3 - Perfil (P2)

- [x] T028 [P] [US3] Test unit `update-profile.test.ts` y `get-my-profile.test.ts`
- [x] T029 [P] [US3] Test contrato `test/contract/identity/me.test.ts`: GET/PATCH, 400 dirección incompleta
- [x] T030 [US3] Implementar `update-profile.ts`, `get-my-profile.ts` (lee read-db con caché), rutas `/api/me`
- [x] T031 [P] [US3] Test web `AccountPage.test.tsx` (editar nombre y dirección, errores por campo)
- [x] T032 [US3] Implementar `useUpdateProfile`, `AddressForm`, `AccountPage`

## Phase 7: Polish

- [x] T033 Redacción de campos sensibles en logger + test que lo verifica
- [x] T034 Métrica `auth_login_total{result}` y panel en Grafana
- [x] T035 Suite completa, lint, typecheck y arch en verde; validar quickstart

## Dependencies

Setup → Foundational → US1 → US2 → US4 → US3 → Polish. Depende de 001 completa.
