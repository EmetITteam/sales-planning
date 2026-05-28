-- Migration M012: DROP мертвої колонки gap_closures.action (TD-6)
-- Date: 2026-05-28
-- Risk: LOW — колонка DEPRECATED, усі значення null, у коді не читається й не
--   пишеться (grep по src: жодного доступу до поля `action`; лише generic
--   select('*')). forecasts.action вже дропнуто раніше — це завершальна частина.
--
-- Why: чистка схеми. Колонка лишилась з ранньої версії планування (коли
--   зберігали текстову «дію»), зараз не використовується.
--
-- Safety: DO-блок ABORT-ить транзакцію якщо раптом знайдено non-null рядки
--   (захист від втрати даних). Бекап зроблено перед застосуванням.
--
-- ROLLBACK: див. 20260528_012_drop_gap_closures_action_rollback.sql
--   (повертає порожню колонку; дані не відновлюються — їх не було)

BEGIN;

DO $$
DECLARE
  col_exists boolean;
  non_null_cnt integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gap_closures' AND column_name = 'action'
  ) INTO col_exists;

  IF NOT col_exists THEN
    RAISE NOTICE 'gap_closures.action вже відсутня — нічого робити';
    RETURN;
  END IF;

  -- Dynamic SQL — щоб не падало на плануванні якщо колонки нема.
  EXECUTE 'SELECT count(*) FROM gap_closures WHERE action IS NOT NULL' INTO non_null_cnt;
  IF non_null_cnt > 0 THEN
    RAISE EXCEPTION 'ABORT: gap_closures.action має % non-null рядків — перевірити перед DROP', non_null_cnt;
  END IF;

  RAISE NOTICE 'gap_closures.action: 0 non-null рядків — безпечно дропати';
END $$;

ALTER TABLE gap_closures DROP COLUMN IF EXISTS action;

COMMIT;
