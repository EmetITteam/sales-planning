-- Migration M6: planning_snapshots — фіксація первинного списку клієнтів
-- Date: 2026-05-12
-- Risk: LOW (нова таблиця, нічого не міняє у існуючих)
--
-- Why: User вимагає аудит "хто був з самого початку місяця, кого менеджер
-- видалив, кого залишив". Зараз /api/planning POST робить DELETE notIn() —
-- видалені рядки зникають назавжди, історії немає. Snapshot фіксується
-- ОДИН РАЗ (першого save / першого open форми) і більше не змінюється.
--
-- Source-у клієнтів два:
--   1. Frontend (planning-form після auto-populate) → /api/planning/init-snapshot
--   2. Backfill-script для існуючих менеджерів → той самий endpoint
--
-- block_type:
--   'forecast' — клієнт що auto-populate додав у Прогноз (active за 3 міс)
--   'gap'      — клієнт що auto-populate додав у Закриття розриву
--                (sleeping/lost/none або new)
--
-- captured_at — коли snapshot створився. Якщо backfill — день запуску;
-- якщо реально першим save — момент save.

CREATE TABLE IF NOT EXISTS planning_snapshots (
  id BIGSERIAL PRIMARY KEY,
  period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  segment_code TEXT NOT NULL,
  block_type TEXT NOT NULL CHECK (block_type IN ('forecast', 'gap')),
  client_id_1c TEXT NOT NULL,
  client_name TEXT NOT NULL,
  -- Базові поля з 1С на момент snapshot (для довідки):
  category_1c TEXT,                            -- "Активный"/"Спящий"/"Новый"/...
  last_purchase_date DATE,                     -- остання покупка цього бренду
  last_purchase_amount NUMERIC(15, 2),         -- сума останньої покупки
  -- Метадані:
  source TEXT NOT NULL DEFAULT 'auto-populate' -- 'auto-populate' | 'backfill' | 'manual'
    CHECK (source IN ('auto-populate', 'backfill', 'manual')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Унікальність: один (period, user, segment, type, client) — лише раз
  UNIQUE (period_id, user_id, segment_code, block_type, client_id_1c)
);

-- Індекси для типових запитів аудиту
CREATE INDEX IF NOT EXISTS idx_planning_snapshots_period_user_segment
  ON planning_snapshots (period_id, user_id, segment_code);
CREATE INDEX IF NOT EXISTS idx_planning_snapshots_period
  ON planning_snapshots (period_id);

-- ─── ВЕРИФІКАЦІЯ ───
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'planning_snapshots') AS columns,
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'planning_snapshots') AS indexes
FROM information_schema.tables
WHERE table_name = 'planning_snapshots';
-- Очікую: planning_snapshots, 11 columns, 3 indexes (PK + 2 додаткових + UNIQUE)
