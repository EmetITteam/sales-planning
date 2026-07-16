-- ============================================================================
-- Migration 055: weekly_report_notes — замітки Тижневого звіту (append-only,
-- понедельно, з версіями)
-- Created 2026-07-16
-- ============================================================================
--
-- РМ на планёрці заповнює по кожному бренду «Дія» та «Причина за стандартом»,
-- по регіону — «Висновок», а «Обіцяв минулого тижня» — чек-лист (статус по
-- прошлотижневих «Дія»). Зберігаємо понедельно (week_key = кінець тижня) з
-- ПОВНОЮ історією правок: кожне збереження — новий рядок (append-only), у звіті
-- показуємо останню версію + за потреби історію.
--
-- field:
--   action        — «Дія» по бренду (segment_code = бренд)
--   reason        — «Причина за стандартом» по бренду (segment_code = бренд)
--   conclusion    — «Висновок» по регіону (segment_code = NULL)
--   promise_check — статус виконання прошлотижневої «Дія» (segment_code = бренд;
--                   done = виконано/ні; text = причина невиконання)
-- ============================================================================

CREATE TABLE IF NOT EXISTS weekly_report_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code   text        NOT NULL,          -- регіон звіту (divisionCode)
  segment_code  text,                          -- бренд (NULL для conclusion)
  week_key      text        NOT NULL,          -- кінець тижня (weekEnd, 'YYYY-MM-DD')
  field         text        NOT NULL,          -- action | reason | conclusion | promise_check
  text          text        NOT NULL DEFAULT '',
  done          boolean,                       -- лише для promise_check (виконано/ні)
  author_login  text        NOT NULL,          -- хто зберіг цю версію
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_wrn_field CHECK (field IN ('action','reason','conclusion','promise_check'))
);

COMMENT ON TABLE weekly_report_notes IS
  'Замітки Тижневого звіту (Дія/Причина/Висновок/promise_check), append-only, понедельно (week_key). Остання версія = max(created_at) по (region, segment, week, field).';

-- Читання всіх заміток регіону за тиждень (звіт вантажить одним запитом).
CREATE INDEX IF NOT EXISTS idx_wrn_region_week
  ON weekly_report_notes (region_code, week_key);

-- Пошук останньої версії конкретного поля.
CREATE INDEX IF NOT EXISTS idx_wrn_latest
  ON weekly_report_notes (region_code, week_key, field, segment_code, created_at DESC);

-- RLS deny-all — читає/пише лише сервер (service_role) з перевіркою доступу.
ALTER TABLE weekly_report_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY wrn_deny_all ON weekly_report_notes
  FOR ALL USING (false) WITH CHECK (false);
