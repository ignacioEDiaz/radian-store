-- Up Migration
CREATE TABLE media_assets (
  id         uuid PRIMARY KEY,
  sha256     text NOT NULL UNIQUE,
  mime_type  text NOT NULL,
  width      int  NOT NULL,
  height     int  NOT NULL,
  bytes      int  NOT NULL,
  widths     int[] NOT NULL,
  created_at timestamptz NOT NULL
);

-- Down Migration
DROP TABLE media_assets;
