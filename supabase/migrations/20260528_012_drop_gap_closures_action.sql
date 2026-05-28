-- Migration M012: DROP мертвої колонки gap_closures.action (TD-6)
-- Date: 2026-05-28
-- Risk: LOW — колонка DEPRECATED, у коді не читається й не пишеться (grep по
--   src чистий; лише generic select('*')). forecasts.action вже дропнуто —
--   це завершальна частина.
--
-- Why: чистка схеми. Колонка лишилась з ранньої версії планування (вільний
--   текст «дія»). На демо-БД знайшлось 5 non-null рядків (feshchenko@emet.com,
--   період 20260430, PETARAN, id 1-5) — підтверджено що це МОКОВІ демо-дані,
--   не реальні. Бекап зроблено перед застосуванням (gap_closures: 6687 рядків,
--   нотатки збережені у backups/2026-05-28T*/gap_closures.json).
--
-- ROLLBACK: див. 20260528_012_drop_gap_closures_action_rollback.sql
--   (повертає порожню колонку; дані не відновлюються).

BEGIN;

ALTER TABLE gap_closures DROP COLUMN IF EXISTS action;

COMMIT;
