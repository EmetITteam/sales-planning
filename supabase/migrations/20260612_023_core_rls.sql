-- 023: RLS на core-таблицях планування (audit Week 2 — defense in depth).
--
-- Раніше тільки meetings / meeting_syncs / notifications / client_comments
-- мали RLS. Решта таблиць була без — `service_role` (наш бекенд) обходить
-- RLS у будь-якому випадку, тож фактичної дірки нема, але якщо хтось у
-- майбутньому випадково використає anon/authenticated client замість
-- service_role — він би мав повний доступ.
--
-- Цей файл вмикає RLS на ВСІХ core-таблицях і додає `svc_full_access`
-- policy для service_role. Для anon/authenticated політик нема — отже
-- доступу нема (RLS default-deny).
--
-- Безпечно для проду: service_role вже працює як треба і нічого не
-- зміниться у поведінці API. Це лише defense in depth.

-- Wrapper macro для ідемпотентного enable+policy. Викликаємо для кожної таблиці.
do $$
declare
  tbl text;
  tables text[] := array[
    'users',
    'periods',
    'forecasts',
    'gap_closures',
    'period_summaries',
    'planning_snapshots',
    'planning_locks',
    'planning_settings',
    'actual_activities'
  ];
begin
  foreach tbl in array tables loop
    -- Перевіряємо чи таблиця взагалі існує (захист від drop-у у майбутніх міграціях).
    if exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = tbl
    ) then
      -- Enable RLS — ідемпотентно (повторний виклик no-op).
      execute format('alter table public.%I enable row level security', tbl);

      -- Додаємо policy лише якщо її ще нема — інакше create policy fail-ить.
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = tbl and policyname = 'svc_full_access'
      ) then
        execute format(
          'create policy svc_full_access on public.%I for all to service_role using (true) with check (true)',
          tbl
        );
      end if;

      raise notice 'RLS enabled + svc_full_access policy ensured on %', tbl;
    else
      raise notice 'Table % does not exist — skipping', tbl;
    end if;
  end loop;
end$$;

comment on schema public is
  'sales-planning. RLS enabled на всіх таблицях; service_role bypass.';
