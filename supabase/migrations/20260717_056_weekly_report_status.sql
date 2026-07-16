-- ============================================================================
-- Migration 056: weekly_report_status — фіналізація Тижневого звіту (per регіон
-- × тиждень), за образцем period_summaries.finalized_at для планів.
-- Created 2026-07-17
-- ============================================================================
--
-- РМ наприкінці планёрки натискає «Фіналізувати звіт» — фіксує, що звіт регіону
-- за тиждень заповнений (усі Дія/Причина по брендах + Висновок + відмічені
-- прошлотижневі обіцянки). Директор/РОП бачить зведення: які регіони вже здали
-- звіт за тиждень, які ні (аналог «Готовності планування»).
--
-- Один рядок = один регіон × тиждень. finalized_at IS NULL → не фіналізовано
-- (або пере-відкрито). Пере-відкриття (DELETE) скидає finalized_at/by у NULL.
-- ============================================================================

CREATE TABLE IF NOT EXISTS weekly_report_status (
  region_code   text        NOT NULL,          -- регіон звіту (divisionCode)
  week_key      text        NOT NULL,          -- кінець тижня (weekEnd, 'YYYY-MM-DD')
  finalized_at  timestamptz,                   -- коли фіналізовано (NULL = ні)
  finalized_by  text,                          -- хто фіналізував (логін)
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (region_code, week_key)
);

COMMENT ON TABLE weekly_report_status IS
  'Фіналізація Тижневого звіту (per регіон × тиждень). finalized_at IS NULL = не здано/пере-відкрито. Аналог period_summaries.finalized_at для планів.';

-- Зведення по всіх регіонах за тиждень (табличка директора).
CREATE INDEX IF NOT EXISTS idx_wrs_week
  ON weekly_report_status (week_key);

-- RLS deny-all — читає/пише лише сервер (service_role) з перевіркою доступу.
ALTER TABLE weekly_report_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY wrs_deny_all ON weekly_report_status
  FOR ALL USING (false) WITH CHECK (false);
