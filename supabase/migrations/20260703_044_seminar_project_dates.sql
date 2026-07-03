-- ============================================================================
-- Migration 044: sales.seminar_date + project_date (Ellanse events)
-- Created 2026-07-03
-- ============================================================================
--
-- Блок «Семінари у представництвах» групував по (seminar, division) БЕЗ дати →
-- декілька подій одного семінару в одному місті (різні дати) зливались в 1
-- рядок. Треба рахувати кожну ДАТУ проведення окремо.
--
-- У sales є лише НАЗВА семінару/проекту (seminar/project TEXT), дати немає.
-- Додаємо два поля: дата проведення семінару + дата проведення проекту.
-- Заповнюються з вигрузки 1С по клієнтах Ellanse (і майбутнім getSalesLineItems).
--
-- Групування семінарів стане: (seminar, division, seminar_date) = 1 подія.
-- ============================================================================

ALTER TABLE sales ADD COLUMN IF NOT EXISTS seminar_date DATE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS project_date DATE;

-- Індекс під фільтр Ellanse-семінарів з датою (rep-seminars).
CREATE INDEX IF NOT EXISTS idx_sales_seminar_date ON sales (seminar_date)
  WHERE seminar_date IS NOT NULL;
