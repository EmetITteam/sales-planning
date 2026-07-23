-- ============================================================================
-- Migration 065: rop_market_notes — 4.5 Ринкові сигнали, НОВА модель.
-- Created 2026-07-23
-- ============================================================================
--
-- 4.5 переведено з СПИСКУ сигналів (market_signals — сигнал/джерело/кому/дедлайн)
-- на 3 ВІЛЬНІ ТЕКСТОВІ поля per період (заповнює РОП):
--   failures — причини невиконання по червоним ТМ (повторюються у 3+ регіонів)
--   drivers  — драйвери виконання по зеленим ТМ (повторюються у 3+ регіонів)
--   other    — інші сигнали ринку (дії конкурента, зміна попиту, дефіцит, новинка)
--
-- market_signals (migr 063/064) більше не використовується UI — можна дропнути
-- окремо після підтвердження (лишаємо поки що, щоб не втратити тестові дані).
-- ============================================================================

CREATE TABLE IF NOT EXISTS rop_market_notes (
  period      text        NOT NULL,             -- 'YYYY-MM'
  field       text        NOT NULL,             -- failures | drivers | other
  note        text,
  updated_by  text,                             -- хто редагував (логін)
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (period, field),
  CONSTRAINT rop_market_notes_field_chk CHECK (field IN ('failures','drivers','other'))
);

COMMENT ON TABLE rop_market_notes IS
  '4.5 Ринкові сигнали Зведеного звіту РОП — 3 вільні текстові поля per період (failures/drivers/other). Заповнює РОП.';

-- RLS deny-all — читає/пише лише сервер (service_role) з перевіркою ролі РОП+.
ALTER TABLE rop_market_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY rop_market_notes_deny_all ON rop_market_notes
  FOR ALL USING (false) WITH CHECK (false);
