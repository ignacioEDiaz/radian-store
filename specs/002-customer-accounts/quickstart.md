# Quickstart: Cuentas

```bash
# registro
curl -i -c jar -H 'content-type: application/json' -H 'origin: http://localhost:5173' \
  -d '{"name":"Ana","email":"ana@example.com","password":"una-clave-larga"}' \
  localhost:3000/api/auth/register
curl -b jar localhost:3000/api/me
# admin inicial (ADMIN_EMAIL / ADMIN_PASSWORD del .env)
curl -i -c admin -H 'content-type: application/json' -H 'origin: http://localhost:5173' \
  -d '{"email":"admin@radian.store","password":"admin-password-123"}' localhost:3000/api/auth/login
```

Web: `/cuenta/registro`, `/cuenta/ingresar`, `/cuenta` (privada).

Validación:

1. 6 logins fallidos seguidos → el sexto responde 429.
2. Registrar el mismo email dos veces → 409.
3. `GET /api/me` sin cookie → 401.
