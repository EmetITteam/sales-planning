-- ============================================================================
-- Migration 062: rop_report_meta — ручні поля Зведеного звіту РОП (per регіон ×
-- період). Наразі одне поле: причина затримки узгодження плану (4.4).
-- Created 2026-07-21
-- ============================================================================
--
-- Звіт РОП (Лист 4) майже весь авто-збирається з існуючих даних. Виняток —
-- «причина затримки» коли регіон узгодив план ПІСЛЯ дедлайну (16:00 4-го роб.
-- дня). РОП вписує причину вручну; якщо не вписав — у звіті авто-текст
-- «прострочено на N роб. днів» (рахується з period_summaries.finalized_at).
--
-- Один рядок = один регіон × період. Розширювана таблиця для майбутніх ручних
-- полів рівня РОП (щоб не плодити окремі таблиці на кожне поле).
-- ============================================================================

CREATE TABLE IF NOT EXISTS rop_report_meta (
  period       text        NOT NULL,             -- 'YYYY-MM'
  region_code  text        NOT NULL,             -- регіон (divisionCode)
  late_reason  text,                             -- причина затримки узгодження плану (ручний ввід РОП)
  updated_by   text,                             -- хто редагував (логін)
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (period, region_code)
);

COMMENT ON TABLE rop_report_meta IS
  'Ручні поля Зведеного звіту РОП (per регіон × період). late_reason — причина затримки узгодження плану (4.4), коли РОП хоче пояснити прострочення текстом замість авто «прострочено на N днів».';

-- Вибірка всіх регіонів за період (для звіту РОП).
CREATE INDEX IF NOT EXISTS idx_rop_report_meta_period
  ON rop_report_meta (period);

-- RLS deny-all — читає/пише лише сервер (service_role) з перевіркою ролі РОП+.
ALTER TABLE rop_report_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY rop_report_meta_deny_all ON rop_report_meta
  FOR ALL USING (false) WITH CHECK (false);
