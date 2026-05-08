-- Migration M2: Drop legacy columns from period_summaries
-- Date: 2026-05-08
-- Risk: LOW — колонки не використовуються frontend-ом з 2026-04 (Sprint A коли
--   прибрали ручні «Прогноз %» і «Прогноз $» з форми планування).
--
-- Why: Раніше у формі планування були поля «Прогноз %» (month_forecast_pct)
-- і «Прогноз $» (month_forecast_usd) — вручну заповнював менеджер. У Sprint A
-- (28.04) ці поля прибрали з UI, але колонки у БД залишились як «легасі».
-- Сьогодні гарний час почистити.
--
-- Перевірити що дані не пропадуть:
--   SELECT COUNT(*) FROM period_summaries WHERE month_forecast_pct IS NOT NULL OR month_forecast_usd IS NOT NULL;
--   Якщо значуща кількість — спочатку зробити backup.
--
-- Apply:
--   Supabase dashboard → SQL Editor → Run.

-- Backup перед DROP (на випадок якщо знайдеться щось важливе у legacy полях):
-- CREATE TABLE period_summaries_legacy_20260508 AS SELECT * FROM period_summaries;
-- (закоментуй цей backup якщо point-in-time recovery достатньо)

ALTER TABLE period_summaries DROP COLUMN IF EXISTS month_forecast_pct;
ALTER TABLE period_summaries DROP COLUMN IF EXISTS month_forecast_usd;

-- Verify:
-- \d period_summaries
-- очікуємо тільки: id, period_id, user_id, segment_code, gap_action_1, gap_action_2, gap_action_3, created_at, updated_at
