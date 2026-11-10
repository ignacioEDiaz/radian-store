-- Up Migration
CREATE TABLE outbox (
  id                bigserial PRIMARY KEY,
  event_id          uuid NOT NULL UNIQUE,
  event_type        text NOT NULL,
  aggregate_type    text NOT NULL,
  aggregate_id      uuid NOT NULL,
  aggregate_version int  NOT NULL,
  payload           jsonb NOT NULL,
  occurred_at       timestamptz NOT NULL,
  processed_at      timestamptz,
  attempts          int NOT NULL DEFAULT 0,
  last_error        text,
  failed_at         timestamptz
);

CREATE INDEX outbox_pending_idx ON outbox (id)
  WHERE processed_at IS NULL AND failed_at IS NULL;

CREATE TABLE consumer_checkpoint (
  consumer   text NOT NULL,
  event_id   uuid NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

-- Down Migration
DROP TABLE consumer_checkpoint;
DROP TABLE outbox;
