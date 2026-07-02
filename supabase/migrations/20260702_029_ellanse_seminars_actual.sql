-- ============================================================================
-- Migration 029: ellanse_seminars_actual — факт семінарів Ellanse per місяць
-- Created 2026-07-02
-- ============================================================================
--
-- ПРАВИЛО (ITD 2026-07-02):
--   - Таргет ("план") по Ellanse дистриб'юторам вводиться у strategic_targets
--     (trainings_annual + trainings_repeat + new_trained_annual тощо).
--   - ФАКТ семінарів вводжу вручну admin per (year × month × location).
--     Локації: 'poltava', 'chernivtsi'. Більше по дистриб'юторам немає інфи.
--
-- Крім факту семінарів (кількість подій), таблиця тримає ФАКТ нових обучених
-- клієнтів — тих кого admin ідентифікує вручну (без прив'язки до sales).
-- Автоматичне обчислення «Впервые обученних» іде через sales (див. aggregate.ts):
--   клієнт з ELLANSE + seminar продажем ВПЕРШЕ (жодного попереднього ELLANSE
--   семінарського рядка у всій історії sales).
--
-- Admin only. RLS deny-all.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ellanse_seminars_actual (
  id               BIGSERIAL PRIMARY KEY,
  year             INT NOT NULL,
  month            INT NOT NULL,          -- 1..12
  location         TEXT NOT NULL,         -- 'poltava' або 'chernivtsi'

  seminars_held    INT NOT NULL DEFAULT 0, -- скільки семінарів фактично провели
  new_trained      INT,                    -- скільки нових обучених — опційне (для manual override, обчислюємо з sales)

  notes            TEXT,                   -- опц. коментар
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       TEXT NOT NULL,

  CONSTRAINT uniq_year_month_location UNIQUE (year, month, location),
  CONSTRAINT chk_month CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT chk_location CHECK (location IN ('poltava', 'chernivtsi')),
  CONSTRAINT chk_year_esa CHECK (year >= 2025 AND year <= 2100)
);

COMMENT ON TABLE ellanse_seminars_actual IS
  'Факт семінарів Ellanse дистриб''юторів per (year × month × location). Вводить admin вручну — по цій частині 1С даних немає.';

CREATE INDEX idx_esa_year ON ellanse_seminars_actual (year);
CREATE INDEX idx_esa_year_month ON ellanse_seminars_actual (year, month);

-- RLS deny-all
ALTER TABLE ellanse_seminars_actual ENABLE ROW LEVEL SECURITY;
CREATE POLICY esa_deny_all ON ellanse_seminars_actual
  FOR ALL USING (false) WITH CHECK (false);
