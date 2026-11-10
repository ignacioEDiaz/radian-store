# Implementation Plan: Cuentas de clientes y administradores

**Branch**: `002-customer-accounts` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

## Summary

Bounded context `identity` con el agregado `Customer` (email, nombre, rol, estado, dirección
predeterminada, hash de contraseña argon2id). Comandos contra la base de escritura; el perfil se
proyecta a `customer_profiles` en la base de lectura. Sesión con JWT firmado (HS256, `jose`) en
cookie `HttpOnly; SameSite=Lax; Secure` (en prod) de 7 días; el guard valida firma y consulta el
estado/rol vigente en el modelo de lectura. Rate limit de login en Redis con fallback en memoria.
Web: `authService` + hooks React Query (`useSession`, `useLogin`, ...) y páginas.

## Technical Context

**Language/Version**: TypeScript 6.0, Node 24 (hereda 001)

**Primary Dependencies**: @node-rs/argon2 2 (binarios precompilados), jose 6, @fastify/cookie

**Storage**: write-db `customers`; read-db `customer_profiles`

**Testing**: unit (agregado, handlers con repos en memoria y hasher falso), integración (repos y
proyección reales), contrato (endpoints con `inject`), web (páginas con MSW)

**Performance Goals**: login < 300 ms p95 (dominado por argon2 con parámetros OWASP: m=19 MiB,
t=2, p=1)

**Constraints**: ninguna respuesta ni log contiene contraseñas o hashes

## Constitution Check

| Principio | Cumplimiento |
|-----------|--------------|
| I. TDD | tasks.md: test antes de cada implementación |
| II. DDD | `modules/identity/{domain,application,infrastructure}`; `PasswordHasher`, `TokenIssuer` y `CustomerRepository` como puertos |
| III. CQRS | Register/Login/UpdateProfile = comandos (write-db). `GetMyProfile` y el guard leen `customer_profiles` (read-db). Login lee la base de escritura porque valida una invariante (credenciales) — excepción permitida por la constitución |
| IV. Pools/caché | usa pools de 001; perfil por id cacheado 60 s con tag `customer:<id>` |
| V. Observabilidad | métricas `auth_login_total{result}`; logs sin datos sensibles (redacción pino de `password`, `passwordHash`, `cookie`, `authorization`) |
| VI. Contratos | `packages/contracts/src/identity.ts` |
| VII. Frontend | `features/account/{services,hooks,components,pages}` |

**Result**: PASS.

## Project Structure

```text
apps/api/src/modules/identity/
├── domain/        customer.ts, email.ts, person-name.ts, address.ts, role.ts, events.ts,
│                  customer-repository.ts (puerto), password-hasher.ts (puerto)
├── application/   commands/{register-customer,authenticate,update-profile,ensure-admin}.ts
│                  queries/get-my-profile.ts, ports/token-issuer.ts
└── infrastructure/
    ├── persistence/pg-customer-repository.ts, pg-customer-profile-reader.ts
    ├── projections/customer-profile-projection.ts
    ├── security/argon2-password-hasher.ts, jwt-token-issuer.ts, login-rate-limiter.ts
    └── http/auth-routes.ts, me-routes.ts, auth-guard.ts (preHandler: requireAuth, requireRole)
apps/api/migrations/write/0002_customers.ts, read/0002_customer_profiles.ts
apps/web/src/features/account/
├── services/authService.ts
├── hooks/useSession.ts, useLogin.ts, useRegister.ts, useLogout.ts, useUpdateProfile.ts
├── components/LoginForm.tsx, RegisterForm.tsx, AddressForm.tsx, RequireAuth.tsx, RequireAdmin.tsx
└── pages/LoginPage.tsx, RegisterPage.tsx, AccountPage.tsx
```

## Diseño clave

- `Customer.register({id, email, name, passwordHash, role, now})` emite `CustomerRegistered`.
  `updateProfile` emite `CustomerProfileUpdated`. `deactivate` emite `CustomerDeactivated`.
- `Email` normaliza (`trim().toLowerCase()`) y valida formato; la unicidad la garantiza un índice
  único (`ConflictError` → 409 `EMAIL_TAKEN`). Registro concurrente: el índice resuelve.
- `AuthenticateHandler`: busca por email, verifica hash (si no existe la cuenta, verifica contra un
  hash ficticio para igualar tiempos), chequea estado activo, devuelve `{customerId, role}`.
  El rate limiter cuenta solo fallos, clave `login:<email>:<ip>` con TTL 15 min.
- Token JWT: `sub`, `role`, `iat`, `exp` (7 d), `iss=radian-store`. Cookie `rs_session`.
- Guard: verifica JWT → lee `customer_profiles` (cache) → 401 si no existe/inactiva, 403 si el rol
  no alcanza. Así un cambio de rol o desactivación aplica en la siguiente operación.
- `EnsureAdminHandler` corre al arrancar con `ADMIN_EMAIL`/`ADMIN_PASSWORD` (idempotente).
- Al registrarse o iniciar sesión, la respuesta incluye el perfil (read-your-writes).
- CSRF: `SameSite=Lax` + las mutaciones exigen `content-type: application/json` (o multipart en
  rutas admin) + verificación de `Origin` contra `WEB_ORIGIN`.

## Complexity Tracking

Sin violaciones.
