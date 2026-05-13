-- M11 — Plan vs Fact activity tracking
--
-- Зараз `stage_done=true` ставиться у forecasts/gap_closures коли:
--   - planned stage='Дзвінок' AND 1С підтвердив hasCall (Action 7)
--   - planned stage='Зустріч' AND 1С підтвердив hasMeeting
-- Cross-channel separation: якщо менеджер запланував дзвінок а зробив
-- зустріч — stage_done=false (бо обіцянка не виконана).
--
-- M11 ДОДАТКОВО фіксує реальний факт активностей НЕЗАЛЕЖНО від плану:
--   - actual_had_call=true якщо 1С коли-небудь повертала hasCall=true
--   - actual_had_meeting=true якщо коли-небудь hasMeeting=true
--   - actual_first_seen_at — коли вперше зафіксували активність
--
-- Дозволяє побудувати майбутню аналітику «план vs факт по типах активностей»
-- (наприклад, «менеджер планував 10 дзвінків, зробив 7 дзвінків + 3 зустрічі»).
--
-- ⚠️ ONE-WAY sync: actual_had_* ніколи не скидається з true на false.
-- Якщо 1С раптом повертає hasCall=false — це може бути збій / запізніле
-- оновлення, а не «дзвінок зник». Не перетираємо.

ALTER TABLE forecasts
  ADD COLUMN IF NOT EXISTS actual_had_call BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS actual_had_meeting BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS actual_first_seen_at TIMESTAMPTZ NULL;

ALTER TABLE gap_closures
  ADD COLUMN IF NOT EXISTS actual_had_call BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS actual_had_meeting BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS actual_first_seen_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN forecasts.actual_had_call IS
  'Чи 1С коли-небудь повертала hasCall=true для цього клієнта у поточному періоді. ONE-WAY (не скидається).';
COMMENT ON COLUMN forecasts.actual_had_meeting IS
  'Чи 1С коли-небудь повертала hasMeeting=true. ONE-WAY (не скидається).';
COMMENT ON COLUMN forecasts.actual_first_seen_at IS
  'Час першої фіксації будь-якої активності з 1С (call або meeting).';
