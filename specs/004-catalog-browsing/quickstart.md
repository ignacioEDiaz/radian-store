# Quickstart: Navegación del catálogo

Requiere el catálogo importado (003).

```bash
curl -s 'localhost:3000/api/catalog/products?color=Obsidian%20Black&size=M&sort=price_asc' | jq '.total, .facets.sizes'
curl -s localhost:3000/api/catalog/products/sharp-boot | jq '.options'
curl -s 'localhost:3000/api/catalog/search/suggestions?q=leathr' | jq '.products[].title'
# ETag
curl -si localhost:3000/api/catalog/home | grep -i etag
curl -si -H 'If-None-Match: "<etag>"' localhost:3000/api/catalog/home | head -1   # 304
# caché
curl -s localhost:3000/metrics | grep 'cache_requests_total{name="catalog.list"'
```

Web: `/`, `/tienda`, `/colecciones/tops`, `/productos/sharp-boot`, `/buscar?q=boot`.

Validación: cambiar el precio de un producto en el admin y recargar `/tienda` → precio nuevo en
< 2 s.
