# Data Model: Navegación del catálogo

Usa las tablas de read-db definidas en `specs/003-catalog-management/data-model.md`. Agrega:

- Índices: `catalog_products (status, published_at desc)`, `(status, featured_rank)`,
  `(status, min_price_cents)`, GIN `colors`, GIN `sizes`, GIN `materials`, GIN `search_tsv`,
  GIN `search_text gin_trgm_ops`; `catalog_variants (product_id, color, size)`.

## Modelos de lectura (respuesta)

```ts
ImageView = { url: string /* ancho por defecto */, srcset: { width: number; url: string }[],
              alt: string, width: number, height: number, color: string | null }
ProductCard = { id, slug, title, productType, priceCents, compareAtCents: number|null,
  image: ImageView|null, hoverImage: ImageView|null, colors: string[], available: boolean,
  isNew: boolean /* publicado hace < 30 días */ }
ProductDetail = ProductCard & { description, materials: string[], images: ImageView[],
  variants: { id, sku, color, size, priceCents, available: boolean, availableQty: number }[],
  options: { colors: string[], sizes: string[] }, related: ProductCard[] }
Facets = { colors: FacetValue[], sizes: FacetValue[], materials: FacetValue[],
  types: FacetValue[], price: { min: number, max: number } }   // FacetValue = { value, count }
ProductList = { items: ProductCard[], total, page, pageSize: 24, facets: Facets }
CollectionView = { id, slug, title, description, image: ImageView|null, productCount }
Home = { featuredCollections: CollectionView[], newArrivals: ProductCard[],
         bestSellers: ProductCard[] }
Suggestions = { products: ProductCard[] /* ≤6 */, collections: CollectionView[] /* ≤3 */ }
```

`availableQty` se expone acotado (máx. 10) para no revelar inventario exacto.
