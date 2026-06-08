-- Migration 015: client_name / client_phone / client_category snapshot
--
-- 1С getInitialData повертає для кожної зустрічі поля Client (display name),
-- Phone, ClientCategory. Раніше тримали як transient у Meeting типі — у БД
-- не зберігалось. Після переходу на «БД як кеш» (Phase 2) frontend читає
-- тільки з БД — без цих полів дашборд показує ClientID замість ПІБ.
--
-- Додаємо як persisted snapshot. Не FK — це просто закешований display
-- з 1С. Оновлюється при кожному bulk-import.

alter table meetings
  add column if not exists client_name text,
  add column if not exists client_phone text,
  add column if not exists client_category text;

comment on column meetings.client_name is
  'Display name клієнта (snapshot з 1С getInitialData.Client). Кешовано
   для швидкого UI без додаткового запиту getManagerClients.';
