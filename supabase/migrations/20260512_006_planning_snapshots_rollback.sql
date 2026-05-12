-- Rollback для M6 (planning_snapshots)
-- Date: 2026-05-12
-- Risk: ВТРАЧАЮТЬСЯ ВСІ дані snapshot-ів (forecast/gap клієнтів на початок місяця).
--
-- Коли запускати:
--   - Якщо щось пішло не так після migration M6
--   - Якщо вирішили відмовитись від snapshot-функціоналу
--
-- Що відбувається:
--   - Видаляється таблиця planning_snapshots
--   - Discharge усі індекси і CHECK constraints (CASCADE)
--   - FK з periods і users — нічого не зачіпає (вони не залежать від snapshots)
--   - НЕ ВПЛИВАЄ на forecasts / gap_closures / period_summaries — вони не пов'язані
--
-- ПЕРЕД запуском (якщо хочеш перевірити що буде втрачено):
--   SELECT COUNT(*) FROM planning_snapshots;
--   SELECT block_type, source, COUNT(*) FROM planning_snapshots GROUP BY 1, 2;

DROP TABLE IF EXISTS planning_snapshots CASCADE;

-- Верифікація що таблиця реально зникла:
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'planning_snapshots'
) AS snapshot_table_exists;
-- Очікую: false
