-- Up Migration
CREATE TABLE order_views (
  id          uuid PRIMARY KEY,
  number      text NOT NULL UNIQUE,
  customer_id uuid,
  email       text NOT NULL,
  status      text NOT NULL,
  total_cents int  NOT NULL,
  item_count  int  NOT NULL,
  placed_at   timestamptz NOT NULL,
  doc         jsonb NOT NULL,
  version     int  NOT NULL
);
CREATE INDEX order_views_customer_idx ON order_views (customer_id, placed_at DESC);
CREATE INDEX order_views_status_idx ON order_views (status, placed_at DESC);

-- Down Migration
DROP TABLE order_views;
