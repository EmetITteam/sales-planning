-- Migration M7: Консолідація тижневих period_id у monthly canonical pid
-- Date: 2026-05-12
-- Risk: HIGH — переписуємо period_id у 4 таблицях + видаляємо дублі.
--
-- Why: Зараз forecasts/gap_closures/snapshots/period_summaries розкидані по
-- тижневим period_id (20260503, 20260510, 20260517, 20260531 у травні).
-- Менеджер планує МІСЯЦЬ — а тижневий фільтр у дашборді показує різні цифри
-- бо запит ходить у різні period_id. Канонічний monthly pid = id з
-- week_end = last_day_of_month → 20260430 (April), 20260531 (May).
--
-- Стратегія:
--   1. INSERT canonical periods якщо ще немає (наприклад, 20260430).
--   2. Для forecasts/gap_closures/period_summaries: видалити дублі
--      keep latest updated_at, потім UPDATE period_id у canonical.
--   3. Для planning_snapshots: видалити дублі keep EARLIEST captured_at
--      (бо snapshot — first-write-wins аудит первинного списку клієнтів).
--   4. DELETE non-canonical periods (FK дозволить, бо рядки уже переміщені).
--
-- ROLLBACK: backup у backups/2026-05-12/ (run scripts/backup-supabase.mjs).
--           Відновлення: COPY FROM JSON або повторне insert.

BEGIN;

-- ━━━ STEP 1: Створити canonical monthly periods яких немає ━━━
-- Для кожного унікального month у periods, який ще не має canonical pid
-- (week_end = last_day_of_month) — INSERT його як canonical.
INSERT INTO periods (id, week_start, week_end, month, is_active)
SELECT
  -- canonical id = YYYYMMDD де DD = last day of month
  (EXTRACT(YEAR FROM month)::int * 10000)
    + (EXTRACT(MONTH FROM month)::int * 100)
    + EXTRACT(DAY FROM (date_trunc('month', month) + interval '1 month - 1 day'))::int  AS id,
  date_trunc('month', month)::date AS week_start,
  (date_trunc('month', month) + interval '1 month - 1 day')::date AS week_end,
  month,
  false AS is_active
FROM (SELECT DISTINCT month FROM periods) months
WHERE NOT EXISTS (
  SELECT 1 FROM periods p2
  WHERE p2.month = months.month
    AND p2.week_end = (date_trunc('month', months.month) + interval '1 month - 1 day')::date
)
ON CONFLICT (id) DO NOTHING;

-- ━━━ STEP 2: Хелпер-CTE — мапа non-canonical pid → canonical pid ━━━
-- Зберігаємо у тимчасову таблицю щоб використати у наступних кроках.
CREATE TEMP TABLE pid_remap AS
WITH canonical AS (
  SELECT
    p.month,
    (EXTRACT(YEAR FROM p.month)::int * 10000)
      + (EXTRACT(MONTH FROM p.month)::int * 100)
      + EXTRACT(DAY FROM (date_trunc('month', p.month) + interval '1 month - 1 day'))::int AS canonical_id
  FROM periods p
  GROUP BY p.month
)
SELECT
  p.id AS old_pid,
  c.canonical_id AS new_pid
FROM periods p
JOIN canonical c ON c.month = p.month
WHERE p.id <> c.canonical_id;

-- ━━━ STEP 3: forecasts — DELETE дубліс keep latest updated_at ━━━
-- Дубліс: (canonical_pid, user_id, segment_code, client_id_1c) повторюється
-- у двох тижнях того ж місяця.
WITH ranked AS (
  SELECT
    f.id,
    ROW_NUMBER() OVER (
      PARTITION BY
        COALESCE(r.new_pid, f.period_id),
        f.user_id, f.segment_code, f.client_id_1c
      ORDER BY f.updated_at DESC NULLS LAST, f.id DESC
    ) AS rn
  FROM forecasts f
  LEFT JOIN pid_remap r ON r.old_pid = f.period_id
)
DELETE FROM forecasts
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- UPDATE period_id non-canonical → canonical
UPDATE forecasts f
SET period_id = r.new_pid
FROM pid_remap r
WHERE f.period_id = r.old_pid;

-- ━━━ STEP 4: gap_closures — той же pattern ━━━
WITH ranked AS (
  SELECT
    g.id,
    ROW_NUMBER() OVER (
      PARTITION BY
        COALESCE(r.new_pid, g.period_id),
        g.user_id, g.segment_code, g.client_id_1c
      ORDER BY g.updated_at DESC NULLS LAST, g.id DESC
    ) AS rn
  FROM gap_closures g
  LEFT JOIN pid_remap r ON r.old_pid = g.period_id
)
DELETE FROM gap_closures
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

UPDATE gap_closures g
SET period_id = r.new_pid
FROM pid_remap r
WHERE g.period_id = r.old_pid;

-- ━━━ STEP 5: period_summaries — той же pattern (без client_id_1c) ━━━
WITH ranked AS (
  SELECT
    ps.id,
    ROW_NUMBER() OVER (
      PARTITION BY
        COALESCE(r.new_pid, ps.period_id),
        ps.user_id, ps.segment_code
      ORDER BY ps.updated_at DESC NULLS LAST, ps.id DESC
    ) AS rn
  FROM period_summaries ps
  LEFT JOIN pid_remap r ON r.old_pid = ps.period_id
)
DELETE FROM period_summaries
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

UPDATE period_summaries ps
SET period_id = r.new_pid
FROM pid_remap r
WHERE ps.period_id = r.old_pid;

-- ━━━ STEP 6: planning_snapshots — keep EARLIEST captured_at ━━━
-- Snapshot — це аудит первинного списку (first-write-wins). Якщо той самий
-- клієнт зафіксований у тижні 1 і у тижні 2 — залишаємо тижня 1 (раніше).
WITH ranked AS (
  SELECT
    ps.id,
    ROW_NUMBER() OVER (
      PARTITION BY
        COALESCE(r.new_pid, ps.period_id),
        ps.user_id, ps.segment_code, ps.block_type, ps.client_id_1c
      ORDER BY ps.captured_at ASC NULLS LAST, ps.id ASC
    ) AS rn
  FROM planning_snapshots ps
  LEFT JOIN pid_remap r ON r.old_pid = ps.period_id
)
DELETE FROM planning_snapshots
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

UPDATE planning_snapshots ps
SET period_id = r.new_pid
FROM pid_remap r
WHERE ps.period_id = r.old_pid;

-- ━━━ STEP 7: DELETE non-canonical periods ━━━
-- FK дозволить — усі залежні рядки вже переміщені.
DELETE FROM periods
WHERE id IN (SELECT old_pid FROM pid_remap);

-- ━━━ STEP 8: Cleanup ━━━
DROP TABLE pid_remap;

COMMIT;

-- ━━━ ВЕРИФІКАЦІЯ (run after commit) ━━━
-- Очікувано:
--   periods: 9 → 2 (один на місяць — 20260430 і 20260531)
--   forecasts: 1218 → 1179 (-39 дублів)
--   gap_closures: 3297 → 3148 (-149 дублів)
--   planning_snapshots: 23421 → 19901 (-3520 дублів)
--   period_summaries: 80 → 73 (-7 дублів)
--
-- Σ amount має бути ≥ старого (бо latest updated_at, а не earliest).
-- snapshots Σ — без змін (той самий клієнт, можливо інша source).
