-- Up Migration
CREATE TABLE carts (
  id          uuid PRIMARY KEY,
  customer_id uuid UNIQUE,
  version     int  NOT NULL,
  created_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL
);
CREATE INDEX carts_guest_updated_idx ON carts (updated_at) WHERE customer_id IS NULL;

CREATE TABLE cart_lines (
  id               uuid PRIMARY KEY,
  cart_id          uuid NOT NULL REFERENCES carts (id) ON DELETE CASCADE,
  variant_id       uuid NOT NULL,
  product_id       uuid NOT NULL,
  quantity         int  NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_cents int  NOT NULL,
  position         int  NOT NULL,
  UNIQUE (cart_id, variant_id)
);

-- Down Migration
DROP TABLE cart_lines;
DROP TABLE carts;
