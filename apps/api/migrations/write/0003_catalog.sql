-- Up Migration
CREATE TABLE products (
  id               uuid PRIMARY KEY,
  slug             text NOT NULL UNIQUE,
  title            text NOT NULL,
  description      text NOT NULL,
  product_type     text NOT NULL,
  materials        text[] NOT NULL DEFAULT '{}',
  tags             text[] NOT NULL DEFAULT '{}',
  price_cents      int  NOT NULL CHECK (price_cents > 0),
  compare_at_cents int  CHECK (compare_at_cents IS NULL OR compare_at_cents > price_cents),
  status           text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  featured_rank    int,
  published_at     timestamptz,
  version          int  NOT NULL,
  created_at       timestamptz NOT NULL,
  updated_at       timestamptz NOT NULL
);

CREATE TABLE product_variants (
  id          uuid PRIMARY KEY,
  product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  sku         text NOT NULL UNIQUE,
  color       text NOT NULL,
  size        text NOT NULL,
  price_cents int CHECK (price_cents IS NULL OR price_cents > 0),
  position    int  NOT NULL,
  UNIQUE (product_id, color, size)
);

CREATE TABLE product_images (
  id         uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  media_id   uuid NOT NULL,
  alt        text NOT NULL,
  color      text,
  position   int  NOT NULL,
  width      int  NOT NULL,
  height     int  NOT NULL,
  widths     int[] NOT NULL
);

CREATE TABLE collections (
  id             uuid PRIMARY KEY,
  slug           text NOT NULL UNIQUE,
  title          text NOT NULL,
  description    text NOT NULL,
  image          jsonb,
  version        int  NOT NULL,
  created_at     timestamptz NOT NULL,
  updated_at     timestamptz NOT NULL
);

CREATE TABLE collection_products (
  collection_id uuid NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  position      int  NOT NULL,
  PRIMARY KEY (collection_id, product_id)
);
CREATE INDEX collection_products_product_idx ON collection_products (product_id);

-- Down Migration
DROP TABLE collection_products;
DROP TABLE collections;
DROP TABLE product_images;
DROP TABLE product_variants;
DROP TABLE products;
