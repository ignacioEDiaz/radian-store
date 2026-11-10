-- Up Migration
CREATE TABLE customer_profiles (
  id              uuid PRIMARY KEY,
  email           text NOT NULL,
  name            text NOT NULL,
  role            text NOT NULL,
  status          text NOT NULL,
  default_address jsonb,
  version         int  NOT NULL,
  created_at      timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL
);

-- Down Migration
DROP TABLE customer_profiles;
