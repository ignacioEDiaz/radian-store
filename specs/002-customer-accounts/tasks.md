---
description: "Task list for 002-customer-accounts"
---

# Tasks: Cuentas de clientes y administradores

**Input**: `/specs/002-customer-accounts/` · **Tests**: OBLIGATORIOS (TDD).

## Phase 1: Setup

- [ ] T001 Agregar dependencias `@node-rs/argon2`, `jose`, `@fastify/cookie` a `apps/api`
- [ ] T002 [P] Contratos `packages/contracts/src/identity.ts` (Address, Profile, Register, Login, UpdateProfile)
- [ ] T003 [P] Migraciones `migrations/write/0002_customers.ts` y `migrations/read/0002_customer_profiles.ts`

## Phase 2: Foundational

- [ ] T004 [P] Tests unit `test/unit/identity/domain/{email,address,customer}.test.ts`: normalización y validación, eventos emitidos, desactivación
- [ ] T005 Implementar `modules/identity/domain/*`
- [ ] T006 [P] Test integración `test/integration/identity/pg-customer-repository.test.ts`: guardar, buscar por email, conflicto de versión, email duplicado → `ConflictError`, outbox escrito en la misma transacción
- [ ] T007 Implementar `infrastructure/persistence/pg-customer-repository.ts`
- [ ] T008 [P] Test integración `test/integration/identity/customer-profile-projection.test.ts`: eventos → `customer_profiles`, idempotencia
- [ ] T009 Implementar `infrastructure/projections/customer-profile-projection.ts` y registrarla
- [ ] T010 [P] Tests unit `test/unit/identity/security/{argon2-password-hasher,jwt-token-issuer,login-rate-limiter}.test.ts`
- [ ] T011 Implementar `infrastructure/security/*`
- [ ] T012 [P] Test contrato `test/contract/identity/auth-guard.test.ts`: 401 sin cookie, 401 token inválido/expirado, 401 cuenta desactivada, 403 rol insuficiente
- [ ] T013 Implementar `infrastructure/http/auth-guard.ts` (requireAuth, requireRole) y verificación de `Origin`

## Phase 3: User Story 1 - Registro (P1) 🎯

- [ ] T014 [P] [US1] Test unit `test/unit/identity/application/register-customer.test.ts` (repo en memoria, hasher falso, reloj fijo)
- [ ] T015 [P] [US1] Test contrato `test/contract/identity/register.test.ts`: 201 + cookie, 409, 400 contraseña corta, la respuesta no contiene hash
- [ ] T016 [US1] Implementar `application/commands/register-customer.ts` y ruta `POST /api/auth/register`
- [ ] T017 [P] [US1] Test web `features/account/pages/RegisterPage.test.tsx` (MSW): validación por campo, error de email en uso, redirección a `/cuenta`
- [ ] T018 [US1] Implementar `authService.register`, `useRegister`, `RegisterForm`, `RegisterPage`

## Phase 4: User Story 2 - Login/Logout (P1)

- [ ] T019 [P] [US2] Test unit `application/authenticate.test.ts`: credenciales válidas, inválidas (mensaje genérico), cuenta desactivada, bloqueo tras 5 fallos
- [ ] T020 [P] [US2] Test contrato `test/contract/identity/login.test.ts`: 200 + cookie, 401, 429 con `Retry-After`, logout 204
- [ ] T021 [US2] Implementar `authenticate.ts`, rutas login/logout
- [ ] T022 [P] [US2] Test web `LoginPage.test.tsx` y `Header` muestra sesión (`useSession` con 401 → visitante)
- [ ] T023 [US2] Implementar `authService.login/logout/me`, `useSession`, `useLogin`, `useLogout`, `LoginPage`, estado de sesión en el header

## Phase 5: User Story 4 - Rol administrador (P1)

- [ ] T024 [P] [US4] Test unit `ensure-admin.test.ts`: crea si no existe, no duplica, promueve a admin si existía como cliente
- [ ] T025 [US4] Implementar `ensure-admin.ts` y llamada en `main.ts`
- [ ] T026 [P] [US4] Test web `RequireAdmin.test.tsx` y `RequireAuth.test.tsx`
- [ ] T027 [US4] Implementar `RequireAuth`, `RequireAdmin` y layout `/admin` vacío protegido

## Phase 6: User Story 3 - Perfil (P2)

- [ ] T028 [P] [US3] Test unit `update-profile.test.ts` y `get-my-profile.test.ts`
- [ ] T029 [P] [US3] Test contrato `test/contract/identity/me.test.ts`: GET/PATCH, 400 dirección incompleta
- [ ] T030 [US3] Implementar `update-profile.ts`, `get-my-profile.ts` (lee read-db con caché), rutas `/api/me`
- [ ] T031 [P] [US3] Test web `AccountPage.test.tsx` (editar nombre y dirección, errores por campo)
- [ ] T032 [US3] Implementar `useUpdateProfile`, `AddressForm`, `AccountPage`

## Phase 7: Polish

- [ ] T033 Redacción de campos sensibles en logger + test que lo verifica
- [ ] T034 Métrica `auth_login_total{result}` y panel en Grafana
- [ ] T035 Suite completa, lint, typecheck y arch en verde; validar quickstart

## Dependencies

Setup → Foundational → US1 → US2 → US4 → US3 → Polish. Depende de 001 completa.
