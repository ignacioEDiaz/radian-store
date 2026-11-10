# Research: Cuentas

## Hash de contraseñas

- **Decision**: argon2id con `@node-rs/argon2` (m=19456 KiB, t=2, p=1, recomendación OWASP).
- **Rationale**: algoritmo recomendado; el paquete trae binarios precompilados (sin toolchain
  nativa en Windows ni en Alpine).
- **Alternatives**: bcrypt (límite de 72 bytes, más débil ante GPU), `argon2` (requiere compilar).

## Sesión

- **Decision**: JWT HS256 firmado con `jose` en cookie HttpOnly + verificación del estado de la
  cuenta en cada request privado contra el modelo de lectura (cacheado).
- **Rationale**: sin tabla de sesiones que consultar en la base de escritura; revocación efectiva
  por estado de cuenta; cookie no accesible desde JS.
- **Alternatives**: sesiones en Redis (dependería de Redis para autenticar, y la constitución
  exige que Redis sea opcional), JWT en localStorage (expuesto a XSS).

## Rate limit de login

- **Decision**: contador de fallos en Redis (`INCR` + `EXPIRE`) con fallback a un mapa en memoria
  con expiración si Redis no está disponible.
- **Alternatives**: `@fastify/rate-limit` (limita por request, no por fallos de un email).

## CSRF

- **Decision**: `SameSite=Lax`, chequeo de `Origin` y content-type JSON obligatorio en mutaciones.
- **Alternatives**: tokens CSRF sincronizados (innecesarios con estas defensas para una SPA del
  mismo sitio).
