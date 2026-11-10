# HTTP Contracts: Cuentas

Esquemas Zod en `packages/contracts/src/identity.ts`. Errores en problem+json (ver 001).

```ts
Address = { recipient, line1, line2?, city, region, postalCode, country, phone }
Profile = { id, email, name, role: 'customer'|'admin', defaultAddress: Address|null }
```

| Método | Ruta | Auth | Body | Respuesta |
|--------|------|------|------|-----------|
| POST | /api/auth/register | — | `{ name, email, password }` | 201 `Profile` + `Set-Cookie: rs_session` · 409 `EMAIL_TAKEN` · 400 |
| POST | /api/auth/login | — | `{ email, password }` | 200 `Profile` + cookie · 401 `INVALID_CREDENTIALS` · 429 `TOO_MANY_ATTEMPTS` (`Retry-After`) |
| POST | /api/auth/logout | — | — | 204, cookie expirada |
| GET | /api/me | sesión | — | 200 `Profile` · 401 |
| PATCH | /api/me | sesión | `{ name?, defaultAddress?: Address|null }` | 200 `Profile` · 400 |

Cookie `rs_session`: `HttpOnly; Path=/; SameSite=Lax; Max-Age=604800` (+ `Secure` en prod).

Guards reutilizables para otras features: `requireAuth` (401 `UNAUTHENTICATED`),
`requireRole('admin')` (403 `FORBIDDEN`).
