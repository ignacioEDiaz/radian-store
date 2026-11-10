# Quickstart: Gestión del catálogo

```bash
npm run seed:catalog -w apps/api       # importa los productos de Radian (idempotente)
npm run seed:catalog -w apps/api       # segunda vez: 0 creados
```

Panel: http://localhost:5173/admin/productos (ingresar con la cuenta admin del `.env`).

Validación manual:

1. Crear producto "Test Coat", agregar variantes Black/S, Black/M, Oxblood/S con stock 3.
2. Intentar publicar sin imágenes → aparecen los motivos.
3. Subir 2 imágenes, cargar alt, reordenar, publicar → visible en `/productos/test-coat` en < 2 s.
4. Subir un `.png` que en realidad es un PDF → rechazado (415).
5. `curl -I localhost:3000/media/<id>/640.webp` → `Cache-Control: ... immutable` y `ETag`.
6. Abrir el mismo producto en dos pestañas, guardar en ambas → la segunda ve "conflicto de versión".
