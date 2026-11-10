-- Up Migration
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE catalog_products (
  id               uuid PRIMARY KEY,
  slug             text NOT NULL UNIQUE,
  status           text NOT NULL,
  title            text NOT NULL,
  product_type     text NOT NULL,
  materials        text[] NOT NULL DEFAULT '{}',
  colors           text[] NOT NULL DEFAULT '{}',
  sizes            text[] NOT NULL DEFAULT '{}',
  min_price_cents  int  NOT NULL,
  compare_at_cents int,
  available        boolean NOT NULL DEFAULT false,
  featured_rank    int,
  sales_count      int  NOT NULL DEFAULT 0,
  published_at     timestamptz,
  updated_at       timestamptz NOT NULL,
  search_tsv       tsvector NOT NULL,
  search_text      text NOT NULL,
  doc              jsonb NOT NULL,
  version          int  NOT NULL
);

CREATE TABLE catalog_variants (
  variant_id    uuid PRIMARY KEY,
  product_id    uuid NOT NULL,
  sku           text NOT NULL,
  color         text NOT NULL,
  size          text NOT NULL,
  price_cents   int  NOT NULL,
  position      int  NOT NULL,
  on_hand       int  NOT NULL DEFAULT 0,
  reserved      int  NOT NULL DEFAULT 0,
  available_qty int  NOT NULL DEFAULT 0
);
CREATE INDEX catalog_variants_product_idx ON catalog_variants (product_id);

CREATE TABLE catalog_collections (
  id            uuid PRIMARY KEY,
  slug          text NOT NULL UNIQUE,
  title         text NOT NULL,
  description   text NOT NULL,
  image         jsonb,
  product_count int  NOT NULL DEFAULT 0,
  version       int  NOT NULL,
  updated_at    timestamptz NOT NULL
);

CREATE TABLE catalog_collection_products (
  collection_id uuid NOT NULL,
  product_id    uuid NOT NULL,
  position      int  NOT NULL,
  PRIMARY KEY (collection_id, product_id)
);
CREATE INDEX catalog_collection_products_product_idx ON catalog_collection_products (product_id);

-- Down Migration
DROP TABLE catalog_collection_products;
DROP TABLE catalog_collections;
DROP TABLE catalog_variants;
DROP TABLE catalog_products;
