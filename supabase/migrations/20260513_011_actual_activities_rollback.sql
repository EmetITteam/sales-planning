-- Rollback M11 — drop actual_* columns.
ALTER TABLE forecasts
  DROP COLUMN IF EXISTS actual_had_call,
  DROP COLUMN IF EXISTS actual_had_meeting,
  DROP COLUMN IF EXISTS actual_first_seen_at;

ALTER TABLE gap_closures
  DROP COLUMN IF EXISTS actual_had_call,
  DROP COLUMN IF EXISTS actual_had_meeting,
  DROP COLUMN IF EXISTS actual_first_seen_at;
