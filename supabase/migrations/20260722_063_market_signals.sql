-- ============================================================================
-- Migration 063: market_signals — Ринкові сигнали Зведеного звіту РОП (4.5).
-- Created 2026-07-22
-- ============================================================================
--
-- Секція 4.5 Регламенту: РОП вручну фіксує ринкові сигнали (дії конкурентів,
-- зміни попиту, регуляторика, дефіцит/логістика тощо), які потребують реакції.
-- На відміну від rop_report_meta (одне поле per регіон×період), сигнали — це
-- СПИСОК рядків per період (кожен сигнал = окремий рядок), тож окрема таблиця
-- з uuid-ключем.
--
-- Поля: сигнал (опис) · джерело · кому (відповідальний) · дедлайн реакції ·
-- пріоритет (high/medium/low) · статус (new/in_progress/closed) — для трекінгу
-- відпрацювання сигналу на наступних нарадах.
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_signals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period      text        NOT NULL,                    -- 'YYYY-MM'
  signal      text        NOT NULL,                    -- опис сигналу
  source      text,                                    -- джерело (звідки сигнал)
  recipient   text,                                    -- кому / відповідальний
  deadline    date,                                    -- дедлайн реакції
  priority    text        NOT NULL DEFAULT 'medium',   -- high | medium | low
  status      text        NOT NULL DEFAULT 'new',      -- new | in_progress | closed
  created_by  text,                                    -- хто створив (логін)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_signals_priority_chk CHECK (priority IN ('high','medium','low')),
  CONSTRAINT market_signals_status_chk   CHECK (status IN ('new','in_progress','closed'))
);

COMMENT ON TABLE market_signals IS
  'Ринкові сигнали Зведеного звіту РОП (4.5). Список per період: сигнал/джерело/кому/дедлайн + пріоритет і статус. Вводить РОП вручну.';

-- Вибірка сигналів за період (для звіту РОП).
CREATE INDEX IF NOT EXISTS idx_market_signals_period
  ON market_signals (period);

-- RLS deny-all — читає/пише лише сервер (service_role) з перевіркою ролі РОП+.
ALTER TABLE market_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY market_signals_deny_all ON market_signals
  FOR ALL USING (false) WITH CHECK (false);
