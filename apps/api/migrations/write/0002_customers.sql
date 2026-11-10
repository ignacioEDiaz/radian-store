-- Up Migration
CREATE TABLE customers (
  id              uuid PRIMARY KEY,
  email           text NOT NULL UNIQUE,
  name            text NOT NULL,
  password_hash   text NOT NULL,
  role            text NOT NULL CHECK (role IN ('customer', 'admin')),
  status          text NOT NULL CHECK (status IN ('active', 'disabled')),
  default_address jsonb,
  version         int  NOT NULL,
  created_at      timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL
);

-- Down Migration
DROP TABLE customers;
