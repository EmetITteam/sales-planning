-- Rollback for 023_core_rls
-- Прибирає svc_full_access policy і вимикає RLS на тих самих 9 таблицях.
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
    if exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = tbl
    ) then
      execute format('drop policy if exists svc_full_access on public.%I', tbl);
      execute format('alter table public.%I disable row level security', tbl);
    end if;
  end loop;
end$$;
