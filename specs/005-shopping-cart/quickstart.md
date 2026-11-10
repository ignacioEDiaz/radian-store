# Quickstart: Carrito

```bash
V=$(curl -s localhost:3000/api/catalog/products/sharp-boot | jq -r '.variants[0].id')
curl -s -c jar -b jar -H 'content-type: application/json' -H 'origin: http://localhost:5173' \
  -d "{\"variantId\":\"$V\",\"quantity\":2}" localhost:3000/api/cart/items | jq '.itemCount, .subtotalCents'
curl -s -b jar localhost:3000/api/cart | jq '.lines | length'
```

Web: agregar desde `/productos/sharp-boot` → se abre el drawer y el contador sube al instante.

Validación:

1. Agregar 11 unidades → 422 `LINE_LIMIT`.
2. Armar carrito como visitante, iniciar sesión con una cuenta que ya tenía carrito → combinado.
3. Cambiar el precio desde el admin → el drawer muestra el aviso "el precio cambió".
