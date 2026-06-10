-- ============================================================================
-- 021_notifications — таблиця сповіщень для Bitrix-style notification center
-- ============================================================================
--
-- Призначення: центральна точка для всіх повідомлень користувачу — нові
-- коментарі у рекламаціях, нагадування зустрічей, ДН клієнтів тощо. UI у
-- шапці колокольчик з лічильником непрочитаних → dropdown зі списком.
--
-- Тип `type` — string бо постійно додавати ENUM-значення складно; натомість
-- valid types перевіряються у TypeScript на серверній стороні.
--
-- RLS: service role обходить (наш API), для user-side доступу запиту нема —
-- весь UI йде через наш Next.js endpoint.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_login text not null,
  type text not null,
  title text not null,
  message text,
  link text,
  meta jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Index для основного query: непрочитані поточного юзера, найновіші зверху.
create index if not exists notifications_user_unread_idx
  on public.notifications (user_login, read_at, created_at desc);

-- Index по типу для майбутньої фільтрації (типу «тільки рекламації»).
create index if not exists notifications_user_type_idx
  on public.notifications (user_login, type, created_at desc);

-- ANTI-DUPLICATE: коли webhook кілька разів шле той самий event (наприклад
-- retry після 5xx), не створюємо дублі. dedup_key — будь-який тимчасовий
-- ідентифікатор event-у з зовнішньої системи (наприклад `bitrix:claim:12:comment:9876`).
alter table public.notifications
  add column if not exists dedup_key text;

create unique index if not exists notifications_dedup_uniq
  on public.notifications (dedup_key)
  where dedup_key is not null;

-- Service role bypass — UI йде через наш API, RLS-policies нам не потрібні,
-- але вмикаємо щоб ніхто випадково не зробив anon-запит.
alter table public.notifications enable row level security;

-- Дозволяємо тільки service_role (наш бекенд). Anon/authenticated — нічого
-- (явно reject через відсутність permissive policy).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications' and policyname = 'svc_full_access'
  ) then
    create policy svc_full_access on public.notifications
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end$$;

comment on table public.notifications is
  '🔔 Bitrix-style notification center — сповіщення для UI колокольчика.';
