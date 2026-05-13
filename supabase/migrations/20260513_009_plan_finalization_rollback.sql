-- Rollback M9 — drop finalization columns.
-- ⚠️ Втратить інформацію про те хто і коли фіналізував плани.

DROP INDEX IF EXISTS idx_period_summaries_finalized;
ALTER TABLE period_summaries
  DROP COLUMN IF EXISTS finalized_at,
  DROP COLUMN IF EXISTS finalized_by;
