-- M9 — Finalization columns on period_summaries
--
-- Менеджер натискає «Фіналізувати планування» по конкретному
-- (manager × segment × month) → finalized_at + finalized_by пишуться.
-- Після цього /api/planning POST відмовляє у зміні сум / списку клієнтів;
-- дозволяє тільки stage_comment + stage_done. Admin обходить guard.
-- Розфіналізація — тільки admin (через окремий endpoint).
--
-- Гранулярність: composite unique (period_id, user_id, segment_code) у
-- period_summaries — те що нам треба (фіналізація per-сегмент).

ALTER TABLE period_summaries
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS finalized_by TEXT NULL;

-- Partial index — щоб швидко знаходити фіналізовані рядки (queries для
-- admin сторінки «Розфіналізація» + dashboard позначки «✓ Фіналізовано»).
CREATE INDEX IF NOT EXISTS idx_period_summaries_finalized
  ON period_summaries (finalized_at)
  WHERE finalized_at IS NOT NULL;

-- Аудиторський коментар прямо у БД (видно у Supabase Dashboard).
COMMENT ON COLUMN period_summaries.finalized_at IS
  'Час фіналізації плану (NULL = чернетка, не NULL = заблоковано від змін сум/клієнтів). Розфіналізує тільки admin.';
COMMENT ON COLUMN period_summaries.finalized_by IS
  'Логін того хто фіналізував (зазвичай менеджер сам = user_id, але adminу теж дозволено).';
