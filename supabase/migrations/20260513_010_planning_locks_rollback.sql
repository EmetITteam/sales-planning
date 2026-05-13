-- Rollback M10 — drop planning_locks and planning_settings.
DROP INDEX IF EXISTS idx_planning_locks_user;
DROP INDEX IF EXISTS idx_planning_locks_month;
DROP TABLE IF EXISTS planning_locks;
DROP TABLE IF EXISTS planning_settings;
