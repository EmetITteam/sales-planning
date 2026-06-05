-- Migration 019: anketa_data_json snapshot для префілу survey-форми
--
-- 1С getInitialData повертає AnketaDataJSON у meeting object — це JSON
-- з відповідями на анкету попередньої зустрічі з тим самим клієнтом.
-- Раніше зберігалось лише як transient у TS типі — bulk-import у БД його
-- не писав, тому MeetingOutcomeDialog префіл ніколи не спрацьовував.
--
-- Тепер пишемо у БД як text, адаптер парсить JSON.

alter table meetings
  add column if not exists anketa_data_json text;

comment on column meetings.anketa_data_json is
  'JSON snapshot з 1С AnketaDataJSON — анкета попередньої зустрічі того
   клієнта (legacy meeting-app pattern). NULL якщо нема історії.';
