-- Migration M1: Add indices for common query patterns
-- Date: 2026-05-08
-- Risk: NONE (CREATE INDEX is non-destructive, IF NOT EXISTS prevents duplicates)
--
-- Why: SELECT WHERE period_id=X AND user_id=Y AND segment_code=Z runs on every
-- planning form load + every region/director aggregate. With 25 menagers ×
-- 9 brands × 12 months = potentially 2700+ rows in forecasts/gap_closures.
-- Without indices, scaning grows linearly. PK alone is on `id` (auto), not
-- helpful for our query shape.
--
-- Apply:
--   1. Open Supabase dashboard → SQL Editor
--   2. Paste this file content + Run
--   3. Verify: SELECT * FROM pg_indexes WHERE tablename IN ('forecasts','gap_closures','period_summaries');
--
-- Or via supabase CLI:
--   supabase db push (якщо проект налаштовано)

-- forecasts: lookup by (period × user × segment)
CREATE INDEX IF NOT EXISTS idx_forecasts_period_user_segment
  ON forecasts (period_id, user_id, segment_code);

-- gap_closures: same pattern
CREATE INDEX IF NOT EXISTS idx_gap_closures_period_user_segment
  ON gap_closures (period_id, user_id, segment_code);

-- period_summaries: same composite (already part of UNIQUE constraint but
-- explicit index helps Postgres planner for some query shapes)
CREATE INDEX IF NOT EXISTS idx_period_summaries_period_user_segment
  ON period_summaries (period_id, user_id, segment_code);

-- forecasts: lookup by user (для агрегацій по менеджеру через всі періоди)
CREATE INDEX IF NOT EXISTS idx_forecasts_user
  ON forecasts (user_id);

CREATE INDEX IF NOT EXISTS idx_gap_closures_user
  ON gap_closures (user_id);

-- created_at для time-based cleanup queries у майбутньому (наприклад
-- архівація старих периодів)
CREATE INDEX IF NOT EXISTS idx_forecasts_created_at
  ON forecasts (created_at);

CREATE INDEX IF NOT EXISTS idx_gap_closures_created_at
  ON gap_closures (created_at);
