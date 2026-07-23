-- ============================================================================
-- Migration 066: rop_report_finalization — фіналізація Зведеного звіту РОП.
-- Created 2026-07-23
-- ============================================================================
--
-- Аналог weekly_report_status (фіналізація РМ), але рівня РОП і per ТИЖДЕНЬ
-- (звіт РОП — щотижневий). Фіналізація = «звіт здано»:
--   · нотіф CSO+CMO у колокольчик,
--   · ЛОК редагування 4.5 (ринкові сигнали) + 4.4 (причина затримки) для ЦЬОГО
--     тижня (як фіналізація плану лочить місяць). Інші тижні/періоди — вільні.
-- Пере-відкрити (finalized_at=NULL) може РОП/admin — за тими ж правилами.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rop_report_finalization (
  period       text        NOT NULL,             -- 'YYYY-MM'
  week         text        NOT NULL,             -- weekEnd 'YYYY-MM-DD'
  finalized_at timestamptz,
  finalized_by text,
  PRIMARY KEY (period, week)
);

COMMENT ON TABLE rop_report_finalization IS
  'Фіналізація Зведеного звіту РОП (Лист 4) per період×тиждень. finalized_at → звіт здано (нотіф CSO/CMO + лок редагування 4.5/4.4 цього тижня).';

-- RLS deny-all — читає/пише лише сервер (service_role) з перевіркою ролі.
ALTER TABLE rop_report_finalization ENABLE ROW LEVEL SECURITY;
CREATE POLICY rop_report_finalization_deny_all ON rop_report_finalization
  FOR ALL USING (false) WITH CHECK (false);
