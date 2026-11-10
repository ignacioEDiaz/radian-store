-- Up Migration
CREATE TABLE inventory_items (
  variant_id uuid PRIMARY KEY,
  product_id uuid NOT NULL,
  sku        text NOT NULL,
  on_hand    int  NOT NULL CHECK (on_hand >= 0),
  reserved   int  NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  version    int  NOT NULL,
  CONSTRAINT inventory_reserved_le_on_hand CHECK (reserved <= on_hand)
);
CREATE INDEX inventory_items_product_idx ON inventory_items (product_id);

CREATE TABLE stock_movements (
  id         bigserial PRIMARY KEY,
  variant_id uuid NOT NULL,
  delta      int  NOT NULL,
  reason     text NOT NULL,
  actor_id   uuid,
  order_id   uuid,
  created_at timestamptz NOT NULL
);
CREATE INDEX stock_movements_variant_idx ON stock_movements (variant_id, created_at DESC);

-- Down Migration
DROP TABLE stock_movements;
DROP TABLE inventory_items;
