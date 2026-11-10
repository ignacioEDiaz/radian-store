-- Up Migration
CREATE TABLE consumer_checkpoint (
  consumer   text NOT NULL,
  event_id   uuid NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

-- Down Migration
DROP TABLE consumer_checkpoint;
