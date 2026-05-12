-- Rollback для M8 (`008_archived_at_for_soft_delete.sql`).
--
-- Запускати тільки якщо потрібен повний відкат soft-delete механізму.
-- Спочатку відновити archived рядки:
--   UPDATE forecasts SET archived_at = NULL WHERE archived_at IS NOT NULL;
--   UPDATE gap_closures SET archived_at = NULL WHERE archived_at IS NOT NULL;
-- Потім запустити цей файл.

DROP INDEX IF EXISTS idx_forecasts_active;
DROP INDEX IF EXISTS idx_gap_closures_active;

ALTER TABLE forecasts DROP COLUMN IF EXISTS archived_at;
ALTER TABLE gap_closures DROP COLUMN IF EXISTS archived_at;
