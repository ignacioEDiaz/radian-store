-- Up Migration
CREATE SEQUENCE order_number_seq START 1001;

CREATE TABLE orders (
  id                     uuid PRIMARY KEY,
  number                 text NOT NULL UNIQUE,
  customer_id            uuid,
  cart_id                uuid,
  email                  text NOT NULL,
  status                 text NOT NULL CHECK (status IN ('pending_payment', 'paid', 'shipped', 'cancelled')),
  doc                    jsonb NOT NULL,
  total_cents            int  NOT NULL,
  reservation_expires_at timestamptz NOT NULL,
  version                int  NOT NULL,
  placed_at              timestamptz NOT NULL,
  updated_at             timestamptz NOT NULL
);
CREATE INDEX orders_pending_expiry_idx ON orders (reservation_expires_at) WHERE status = 'pending_payment';

CREATE TABLE stock_reservations (
  order_id   uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity   int  NOT NULL CHECK (quantity > 0),
  status     text NOT NULL CHECK (status IN ('active', 'committed', 'released', 'restocked')),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (order_id, variant_id)
);

CREATE TABLE discount_codes (
  id                 uuid PRIMARY KEY,
  code               text NOT NULL UNIQUE,
  kind               text NOT NULL CHECK (kind IN ('percent', 'fixed')),
  value              int  NOT NULL CHECK (value > 0),
  starts_at          timestamptz,
  ends_at            timestamptz,
  min_subtotal_cents int,
  once_per_email     boolean NOT NULL DEFAULT false,
  active             boolean NOT NULL DEFAULT true
);

CREATE TABLE discount_redemptions (
  code_id     uuid NOT NULL REFERENCES discount_codes (id),
  email       text NOT NULL,
  order_id    uuid NOT NULL,
  redeemed_at timestamptz NOT NULL,
  PRIMARY KEY (code_id, email, order_id)
);
CREATE INDEX discount_redemptions_email_idx ON discount_redemptions (code_id, email);

CREATE TABLE idempotency_keys (
  scope        text NOT NULL,
  key          text NOT NULL,
  request_hash text NOT NULL,
  status       text NOT NULL CHECK (status IN ('processing', 'completed')),
  http_status  int,
  response     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);

INSERT INTO discount_codes (id, code, kind, value, once_per_email)
VALUES ('5a2b0d6e-1c2f-4b7e-9d4a-0e7f3c9a1b20', 'WELCOME20', 'percent', 20, true);

-- Down Migration
DROP TABLE idempotency_keys;
DROP TABLE discount_redemptions;
DROP TABLE discount_codes;
DROP TABLE stock_reservations;
DROP TABLE orders;
DROP SEQUENCE order_number_seq;
