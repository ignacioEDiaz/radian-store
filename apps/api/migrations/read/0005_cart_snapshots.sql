-- Up Migration
CREATE TABLE cart_snapshots (
  cart_id     uuid PRIMARY KEY,
  customer_id uuid,
  lines       jsonb NOT NULL,
  version     int  NOT NULL,
  updated_at  timestamptz NOT NULL
);
CREATE INDEX cart_snapshots_customer_idx ON cart_snapshots (customer_id);

-- Down Migration
DROP TABLE cart_snapshots;
