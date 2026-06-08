-- Migration 017: RLS safety net для meetings + meeting_syncs + meeting_sync_logs
--
-- Аудит 2026-06-05:
--  - Frontend НЕ звертається напряму до Supabase (нема anon-key у клієнті)
--  - Всі запити йдуть через /api/* з session-auth + ручний filter
--    manager_login=session.login
--  - Service role обходить RLS — всі поточні backend операції продовжать
--    працювати без змін
--  - Цей RLS — defense in depth: якщо колись хтось випадково додасть
--    anon-key у клієнт (через @supabase/supabase-js SDK), RLS не пропустить
--    жодного запиту з anon → нема risk-у leak чужих зустрічей
--
-- Strategy: ENABLE RLS + default-deny для anon/authenticated. Service role
-- bypass — наш backend продовжує працювати. Якщо у майбутньому додамо
-- frontend-side queries — допишемо явні policies з jwt.email claim.

alter table meetings enable row level security;
alter table meeting_syncs enable row level security;

-- Default DENY: відсутність policies = тільки service role може звертатись.
-- Anon і authenticated НЕ можуть SELECT/INSERT/UPDATE/DELETE — отримають
-- порожній result або помилку.

-- Документація для майбутнього: коли треба буде дати фронтенду прямий доступ
-- до meetings (наприклад через @supabase/supabase-js), розкоментувати щось
-- подібне:
--
-- create policy meetings_read_own
--   on meetings for select
--   to authenticated
--   using (manager_login = auth.jwt() ->> 'email');
--
-- І налаштувати JWT з claim email = users.login на /api/auth/login.
