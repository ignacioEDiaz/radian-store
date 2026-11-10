-- Up Migration
CREATE INDEX catalog_products_status_published_idx ON catalog_products (status, published_at DESC);
CREATE INDEX catalog_products_status_featured_idx ON catalog_products (status, featured_rank);
CREATE INDEX catalog_products_status_price_idx ON catalog_products (status, min_price_cents);
CREATE INDEX catalog_products_colors_idx ON catalog_products USING gin (colors);
CREATE INDEX catalog_products_sizes_idx ON catalog_products USING gin (sizes);
CREATE INDEX catalog_products_materials_idx ON catalog_products USING gin (materials);
CREATE INDEX catalog_products_search_tsv_idx ON catalog_products USING gin (search_tsv);
CREATE INDEX catalog_products_search_trgm_idx ON catalog_products USING gin (search_text gin_trgm_ops);
CREATE INDEX catalog_products_title_trgm_idx ON catalog_products USING gin (lower(title) gin_trgm_ops);
CREATE INDEX catalog_variants_lookup_idx ON catalog_variants (product_id, color, size);

-- Down Migration
DROP INDEX catalog_variants_lookup_idx;
DROP INDEX catalog_products_title_trgm_idx;
DROP INDEX catalog_products_search_trgm_idx;
DROP INDEX catalog_products_search_tsv_idx;
DROP INDEX catalog_products_materials_idx;
DROP INDEX catalog_products_sizes_idx;
DROP INDEX catalog_products_colors_idx;
DROP INDEX catalog_products_status_price_idx;
DROP INDEX catalog_products_status_featured_idx;
DROP INDEX catalog_products_status_published_idx;
