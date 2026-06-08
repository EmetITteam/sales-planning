-- Rollback for M13: meetings schema + meeting_syncs + RLS
-- Date: 2026-06-03
-- ⚠️ ВТРАЧАЄ ВСІ ДАНІ у meetings + meeting_syncs. Перед запуском — backup.

BEGIN;

-- Policies (DROP IF EXISTS — щоб rollback працював і після часткового apply)
DROP POLICY IF EXISTS meeting_syncs_delete ON meeting_syncs;
DROP POLICY IF EXISTS meeting_syncs_update ON meeting_syncs;
DROP POLICY IF EXISTS meeting_syncs_insert ON meeting_syncs;
DROP POLICY IF EXISTS meeting_syncs_select ON meeting_syncs;
DROP POLICY IF EXISTS meetings_delete ON meetings;
DROP POLICY IF EXISTS meetings_update ON meetings;
DROP POLICY IF EXISTS meetings_insert ON meetings;
DROP POLICY IF EXISTS meetings_select ON meetings;

-- RLS off (захист коли таблиці лишаться)
ALTER TABLE IF EXISTS meeting_syncs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS meetings DISABLE ROW LEVEL SECURITY;

-- Indexes (буде drop разом з таблицями, але явно — швидше)
DROP INDEX IF EXISTS idx_meeting_syncs_to_retry;
DROP INDEX IF EXISTS idx_meeting_syncs_meeting;
DROP INDEX IF EXISTS idx_meetings_status;
DROP INDEX IF EXISTS idx_meetings_client_date;
DROP INDEX IF EXISTS idx_meetings_manager_date;

-- Trigger + function
DROP TRIGGER IF EXISTS trg_meetings_updated_at ON meetings;
DROP FUNCTION IF EXISTS update_meetings_updated_at();

-- Tables (CASCADE щоб видалити FK з meeting_syncs)
DROP TABLE IF EXISTS meeting_syncs;
DROP TABLE IF EXISTS meetings;

COMMIT;

-- Verification: жодних об'єктів не лишилось
-- SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('meetings', 'meeting_syncs');
-- (має бути порожньо)
