-- Migration M13: meetings schema + meeting_syncs audit trail + RLS shadow-mode
-- Date: 2026-06-03
-- Sprint: 1.1 (Stage 1 — Meetings) per docs/PROJECT_PLAN.md Section 8.2
-- Risk: MEDIUM — нові таблиці без даних-міграцій; FK на users.login; RLS у shadow-mode.
--
-- Why:
--   Перший спринт Stage 1 — створити Postgres-фундамент під модуль зустрічей:
--     1. `meetings` — основна таблиця зустрічей менеджера з клієнтом + геолокація
--     2. `meeting_syncs` — audit trail для buffer-pattern (ADR-2): кожна операція
--        save/update/start/finish відстежує статус синхронізації з 1С
--     3. RLS-політики у shadow-mode (ENABLE без FORCE) — менеджер бачить тільки
--        свої зустрічі; director/admin бачать усі. Service_role продовжує
--        обходити RLS (наш бек-код не ламається). Коли мігруємо на per-user
--        JWT — політики вже на місці і будуть enforced автоматично.
--
-- Backup:
--   Таблиці нові — даних для backup нема. Backup `users` (для FK) бажано, але
--   не обов'язково (FK тільки READ — не змінюємо `users`).
--
-- ROLLBACK:
--   `20260603_013_meetings_schema_rollback.sql`

BEGIN;

-- ============================================================================
-- 1. meetings — основна таблиця зустрічей
-- ============================================================================
CREATE TABLE IF NOT EXISTS meetings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- WHO
  manager_login     text NOT NULL REFERENCES users(login) ON DELETE RESTRICT,
  client_id_1c      text NOT NULL,
  -- WHEN
  date              date NOT NULL,
  time              time NOT NULL,
  duration_min      int,                -- очікувана тривалість у хвилинах (опційно)
  -- WHAT
  status            text NOT NULL DEFAULT 'planned',
  purpose           text,                -- мета візиту (текст або довідник 1С)
  comment           text,                -- довільні нотатки менеджера
  -- WHERE
  planned_address   text,                -- адреса яку менеджер ввів при плануванні
  start_address     text,                -- адреса зафіксована GPS при старті
  start_lat         numeric(9,6),
  start_lon         numeric(9,6),
  end_address       text,                -- адреса зафіксована GPS при завершенні
  end_lat           numeric(9,6),
  end_lon           numeric(9,6),
  geo_manual        boolean NOT NULL DEFAULT false,  -- true якщо менеджер ввів адресу вручну (ADR-7)
  -- Calendar sync (ADR-10)
  calendar_event_id text,                -- ID події у Google Calendar
  -- Audit
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Constraints
  CONSTRAINT meetings_status_chk CHECK (
    status IN ('planned', 'in_progress', 'done', 'postponed', 'cancelled')
  ),
  CONSTRAINT meetings_duration_chk CHECK (duration_min IS NULL OR duration_min > 0)
);

COMMENT ON TABLE meetings IS 'Зустрічі менеджера з клієнтом. Buffer-pattern (ADR-2): первинне зберігання тут, потім cron-batch у 1С через meeting_syncs.';
COMMENT ON COLUMN meetings.manager_login IS 'FK → users.login. Менеджер який проводить зустріч.';
COMMENT ON COLUMN meetings.client_id_1c IS 'Код контрагента з 1С (не FK — клієнти у 1С, не у нас).';
COMMENT ON COLUMN meetings.status IS 'planned | in_progress | done | postponed | cancelled';
COMMENT ON COLUMN meetings.geo_manual IS 'true якщо GPS не зчитався і менеджер ввів адресу вручну (ADR-7).';

-- ============================================================================
-- 2. Indexes для hot-queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_meetings_manager_date
  ON meetings (manager_login, date DESC, time DESC);

CREATE INDEX IF NOT EXISTS idx_meetings_client_date
  ON meetings (client_id_1c, date DESC);

CREATE INDEX IF NOT EXISTS idx_meetings_status
  ON meetings (status, date DESC)
  WHERE status IN ('planned', 'in_progress');

-- ============================================================================
-- 3. Trigger для updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_meetings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_meetings_updated_at ON meetings;
CREATE TRIGGER trg_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION update_meetings_updated_at();

-- ============================================================================
-- 4. meeting_syncs — audit trail для buffer-pattern (ADR-2 + ADR-6 + ADR-9)
-- ============================================================================
CREATE TABLE IF NOT EXISTS meeting_syncs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id        uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  -- Sync state machine (ADR-6)
  status            text NOT NULL DEFAULT 'pending',
  operation         text NOT NULL,        -- save | update | start | finish | reschedule
  -- Snapshots для debug і retry
  payload_snapshot  jsonb,                -- що відправляли (або планували) у 1С
  onec_response     jsonb,                -- відповідь 1С (success або error body)
  failure_reason    text,                 -- причина для failed (ADR-9)
  -- Retry state
  retry_count       int NOT NULL DEFAULT 0,
  next_retry_at     timestamptz,
  synced_at         timestamptz,
  -- Audit
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- Constraints
  CONSTRAINT meeting_syncs_status_chk CHECK (
    status IN ('pending', 'syncing', 'synced', 'failed')
  ),
  CONSTRAINT meeting_syncs_operation_chk CHECK (
    operation IN ('save', 'update', 'start', 'finish', 'reschedule')
  ),
  CONSTRAINT meeting_syncs_retry_chk CHECK (retry_count >= 0)
);

COMMENT ON TABLE meeting_syncs IS 'Audit trail buffer-синку (ADR-2). Кожна операція менеджера → рядок тут → cron-worker обробляє → status оновлюється.';
COMMENT ON COLUMN meeting_syncs.status IS 'pending | syncing | synced | failed (ADR-6). pending → cron picks up → syncing → success: synced; fail: failed з failure_reason';
COMMENT ON COLUMN meeting_syncs.operation IS 'save (новий) | update (правка) | start (геолокація фіксації) | finish (завершення) | reschedule';
COMMENT ON COLUMN meeting_syncs.payload_snapshot IS 'Snapshot того що відправили у 1С. Зберігаємо для idempotent retry.';
COMMENT ON COLUMN meeting_syncs.failure_reason IS 'Текст помилки від 1С — показуємо у UI як «потребує правки» (ADR-9).';

-- Hot-queries indexes
CREATE INDEX IF NOT EXISTS idx_meeting_syncs_meeting
  ON meeting_syncs (meeting_id, created_at DESC);

-- Partial index для cron-worker (тільки pending + failed з ретраєм у майбутньому)
CREATE INDEX IF NOT EXISTS idx_meeting_syncs_to_retry
  ON meeting_syncs (next_retry_at)
  WHERE status IN ('pending', 'failed');

-- ============================================================================
-- 5. RLS — shadow-mode (ADR-4)
-- ============================================================================
-- ENABLE без FORCE: service_role продовжує bypass (наш бек-код не ламається).
-- Політики створені — будуть enforced коли мігруємо на per-user JWT-сесії.
-- Семантика: менеджер бачить тільки свої meetings; director/admin — усі.

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_syncs ENABLE ROW LEVEL SECURITY;

-- --- meetings policies ---
-- SELECT
DROP POLICY IF EXISTS meetings_select ON meetings;
CREATE POLICY meetings_select ON meetings
  FOR SELECT
  USING (
    manager_login = current_setting('app.login', true)
    OR current_setting('app.role', true) IN ('director', 'admin')
  );

-- INSERT
DROP POLICY IF EXISTS meetings_insert ON meetings;
CREATE POLICY meetings_insert ON meetings
  FOR INSERT
  WITH CHECK (
    manager_login = current_setting('app.login', true)
    OR current_setting('app.role', true) IN ('director', 'admin')
  );

-- UPDATE
DROP POLICY IF EXISTS meetings_update ON meetings;
CREATE POLICY meetings_update ON meetings
  FOR UPDATE
  USING (
    manager_login = current_setting('app.login', true)
    OR current_setting('app.role', true) IN ('director', 'admin')
  )
  WITH CHECK (
    manager_login = current_setting('app.login', true)
    OR current_setting('app.role', true) IN ('director', 'admin')
  );

-- DELETE (рідко — soft-delete краще, але політика для повноти)
DROP POLICY IF EXISTS meetings_delete ON meetings;
CREATE POLICY meetings_delete ON meetings
  FOR DELETE
  USING (
    manager_login = current_setting('app.login', true)
    OR current_setting('app.role', true) IN ('director', 'admin')
  );

-- --- meeting_syncs policies (scope через parent meeting) ---
DROP POLICY IF EXISTS meeting_syncs_select ON meeting_syncs;
CREATE POLICY meeting_syncs_select ON meeting_syncs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_syncs.meeting_id
        AND (
          m.manager_login = current_setting('app.login', true)
          OR current_setting('app.role', true) IN ('director', 'admin')
        )
    )
  );

DROP POLICY IF EXISTS meeting_syncs_insert ON meeting_syncs;
CREATE POLICY meeting_syncs_insert ON meeting_syncs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_syncs.meeting_id
        AND (
          m.manager_login = current_setting('app.login', true)
          OR current_setting('app.role', true) IN ('director', 'admin')
        )
    )
  );

DROP POLICY IF EXISTS meeting_syncs_update ON meeting_syncs;
CREATE POLICY meeting_syncs_update ON meeting_syncs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_syncs.meeting_id
        AND (
          m.manager_login = current_setting('app.login', true)
          OR current_setting('app.role', true) IN ('director', 'admin')
        )
    )
  );

DROP POLICY IF EXISTS meeting_syncs_delete ON meeting_syncs;
CREATE POLICY meeting_syncs_delete ON meeting_syncs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_syncs.meeting_id
        AND (
          m.manager_login = current_setting('app.login', true)
          OR current_setting('app.role', true) IN ('director', 'admin')
        )
    )
  );

-- ============================================================================
-- 6. Verification
-- ============================================================================
DO $$
DECLARE
  meetings_exists boolean;
  syncs_exists    boolean;
  meetings_rls    boolean;
  syncs_rls       boolean;
  meetings_pol    int;
  syncs_pol       int;
BEGIN
  -- Tables
  SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='meetings') INTO meetings_exists;
  SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='meeting_syncs') INTO syncs_exists;
  IF NOT meetings_exists THEN RAISE EXCEPTION 'meetings table not created'; END IF;
  IF NOT syncs_exists THEN RAISE EXCEPTION 'meeting_syncs table not created'; END IF;

  -- RLS enabled
  SELECT relrowsecurity FROM pg_class WHERE relname='meetings' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public') INTO meetings_rls;
  SELECT relrowsecurity FROM pg_class WHERE relname='meeting_syncs' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public') INTO syncs_rls;
  IF NOT meetings_rls THEN RAISE EXCEPTION 'RLS not enabled on meetings'; END IF;
  IF NOT syncs_rls THEN RAISE EXCEPTION 'RLS not enabled on meeting_syncs'; END IF;

  -- Policy counts (expect 4 per table: select/insert/update/delete)
  SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='meetings' INTO meetings_pol;
  SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='meeting_syncs' INTO syncs_pol;
  IF meetings_pol <> 4 THEN RAISE EXCEPTION 'meetings expected 4 policies, got %', meetings_pol; END IF;
  IF syncs_pol <> 4 THEN RAISE EXCEPTION 'meeting_syncs expected 4 policies, got %', syncs_pol; END IF;

  RAISE NOTICE '✓ meetings + meeting_syncs created with 4+4 RLS policies (shadow-mode: service_role still bypasses)';
END $$;

COMMIT;

-- ============================================================================
-- Manual notes after apply:
-- ============================================================================
-- 1. Verify both tables exist:
--    SELECT * FROM meetings LIMIT 0;
--    SELECT * FROM meeting_syncs LIMIT 0;
--
-- 2. Verify RLS shadow-mode:
--    -- Простіший варіант (рекомендований у Supabase Dashboard SQL Editor):
--    SELECT schemaname, tablename, rowsecurity
--    FROM pg_tables
--    WHERE tablename IN ('meetings', 'meeting_syncs');
--    -- Expected: rowsecurity = true для обох
--
--    -- Альтернативний — з pg_class (потребує pg_catalog. префікс
--    -- у Dashboard SQL Editor щоб resolution системних колонок не зламався):
--    SELECT
--      c.relname AS table_name,
--      c.relrowsecurity AS rls_enabled,
--      c.relforcerowsecurity AS rls_forced
--    FROM pg_catalog.pg_class c
--    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public'
--      AND c.relname IN ('meetings', 'meeting_syncs');
--    -- Expected: rls_enabled = true, rls_forced = false (shadow)
--
-- 3. Verify policies:
--    SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('meetings', 'meeting_syncs')
--    ORDER BY tablename, policyname;
--    -- Expected: 8 rows (4 per table — select/insert/update/delete)
--
-- 4. service_role smoke-test (через нашу /api/onec proxy):
--    INSERT INTO meetings (manager_login, client_id_1c, date, time, status)
--    VALUES ('itd@emet.in.ua', 'TEST_CLIENT', '2026-06-03', '10:00', 'planned');
--    -- Має пройти (service_role bypasses RLS у shadow-mode).
--    DELETE FROM meetings WHERE client_id_1c = 'TEST_CLIENT';
