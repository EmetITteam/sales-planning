-- M8: soft-delete для одноразового cleanup baгaжу від M7 migration.
--
-- Контекст: M7 (`20260512_007_consolidate_to_monthly_periods.sql`) об'єднала
-- weekly-pid рядки у monthly. Деякі менеджери планували одних клієнтів на
-- одному тижневому pid, потім перемикали фільтр і планували ІНШИХ на
-- іншому pid. М7 unioned обидва набори → дашборд показує bаgaж.
--
-- Soft-delete дозволяє безпечно «приховати» auto-populate-без-правок рядки
-- з попередніх weekly-pid саwes, не втрачаючи дані фізично. Якщо щось
-- піде не так — `UPDATE … SET archived_at = NULL` все повертає.
--
-- Цей soft-delete — ОДНОРАЗОВИЙ. Майбутні DELETE через форму
-- (planning POST з clearAll=true) і далі працюють як hard-delete з БД.
--
-- Поле залишаємо у схемі — корисне для майбутніх audit-сценаріїв
-- («що менеджер видалив за період»).

ALTER TABLE forecasts
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

ALTER TABLE gap_closures
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

-- Partial indices — прискорюють `WHERE archived_at IS NULL` для всіх
-- read-запитів (planning GET, aggregate, region-stats consumers).
-- Без них фільтр `IS NULL` додав би sequential scan на ~5000 рядків.
CREATE INDEX IF NOT EXISTS idx_forecasts_active
  ON forecasts (period_id, user_id, segment_code)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_gap_closures_active
  ON gap_closures (period_id, user_id, segment_code)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN forecasts.archived_at IS 'Soft-delete timestamp. NULL = active. Set by M8 cleanup script for stale auto-populate rows from pre-M7 multi-pid saves. UPSERT in planning route resets to NULL on re-save.';
COMMENT ON COLUMN gap_closures.archived_at IS 'Soft-delete timestamp. NULL = active. Same semantics as forecasts.archived_at.';
