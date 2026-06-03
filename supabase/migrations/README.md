# Supabase міграції

Міграції — `.sql` файли у цій директорії з префіксом `YYYYMMDD_NNN_`.

## Як застосовувати

**Варіант 1 — Supabase dashboard (простіше для пілоту):**

1. Відкрити https://supabase.com/dashboard/project/vncfowqwzrefauqvaolx
2. SQL Editor → New query
3. Скопіювати вміст файлу міграції → Run
4. Перевірити success message

**Варіант 2 — Supabase CLI (для CI / production):**

```bash
supabase db push
```

⚠️ Перш ніж — backup важливих таблиць (Database → Backups → Take backup).

## Журнал міграцій (нові додавати знизу)

| Дата | Файл | Опис | Статус застосування |
|---|---|---|---|
| 2026-05-08 | `20260508_001_add_indices.sql` | Індекси для швидших queries | ✅ applied 2026-05-08 (manual via Dashboard SQL Editor) |
| 2026-05-08 | `20260508_002_drop_dead_columns.sql` | Видалити legacy `month_forecast_pct/usd` з period_summaries | ✅ applied 2026-05-08 (manual via Dashboard SQL Editor) |
| 2026-05-08 | `20260508_003_unpack_stage_comment.sql` | JSON-pack у text колонках → дедіковані колонки training_id/name/date + stage_done | ✅ applied 2026-05-08 (manual via Dashboard SQL Editor) |
| 2026-05-08 | `20260508_004_fix_gap_closures_unique.sql` | **HOTFIX:** додає відсутній UNIQUE constraint на `(period_id, user_id, segment_code, client_id_1c)` у `gap_closures`. Без нього save падає з 42P10 для будь-кого з сплячими клієнтами. Виявлено через QA-тест на проді. | ✅ applied 2026-05-08 (manual via Dashboard SQL Editor; pre-check returned 0 dups) |
| 2026-05-08 | `20260508_005_users_text_pk.sql` | `users.id integer → TEXT PK` (login as PK), remaps FK у forecasts/gap_closures/period_summaries/periods. Прибирає `loginToUserId` хеш-функцію. Логи в БД тепер мають читабельний user_id (емейл). | ✅ applied 2026-05-08 (manual via Dashboard; counts verified 5/6/29/22/2) |

**Backups taken before apply:**
- `backups/2026-05-08/*.json` — local JSON dump via REST (5 tables, see manifest.json)
- In-DB snapshots: `backup_20260508_users`, `backup_20260508_periods`, `backup_20260508_forecasts`, `backup_20260508_gap_closures`, `backup_20260508_period_summaries`. **Видалити через 1-2 тижні** після підтвердження що нова схема стабільна: `DROP TABLE backup_20260508_users, backup_20260508_periods, backup_20260508_forecasts, backup_20260508_gap_closures, backup_20260508_period_summaries;`

**Verification after apply:** row counts unchanged (5 / 6 / 29 / 5 / 2 для users/periods/forecasts/gap_closures/period_summaries). Forecasts/gap_closures з training/stage даними = 0 рядків (ніхто ще не вводив через UI до сьогодні — нічого розпаковувати не було).

## Порядок застосування

**ВАЖЛИВО:**
1. Спочатку М1 (індекси) — безпечно завжди
2. Потім М2 (drop dead columns) — переконатись що nothing reads them (frontend не читає, перевірено)
3. Потім М3 (unpack JSON) — **ОБОВ'ЯЗКОВО ПЕРЕД деплоєм нового коду** (бо код почне писати у нові колонки яких ще нема)
4. Деплой нового коду (через git push) — Vercel auto-deploy

## Rollback

| Міграція | Як відкотити |
|---|---|
| М1 індекси | `DROP INDEX idx_*` (індекси не зачіпають дані) |
| М2 dead columns | Restore з backup (Database → Backups) |
| М3 unpack | Restore з backup. Якщо після М3 написалось — можна `UPDATE forecasts SET stage_comment = json_build_object(...)` для зворотного pack |

## Майбутні міграції (заплановані)

- **M4:** `users.id integer → TEXT PK` (login as PK, прибрати loginToUserId hash). Ризик: high. ✅ Applied 2026-05-08 (M005).
- **M5:** Row Level Security policies + JWT-based auth замість service_role. Ризик: highest, потрібен redesign auth flow.

## CRM-розширення (Stage 1, Sprint 1.1)

| Дата | Файл | Опис | Статус |
|---|---|---|---|
| 2026-06-03 | `20260603_013_meetings_schema.sql` | **M13:** `meetings` + `meeting_syncs` таблиці. RLS у shadow-mode (ENABLE без FORCE — service_role продовжує bypass, наш бек-код не ламається). 4+4 політики (select/insert/update/delete). Тригер `updated_at`. Hot-query індекси. | ⏳ Pending apply |

**Перед apply M13:**
1. Backup `users` (FK constraint лише READ, але про всяк випадок)
2. Запустити SQL через Dashboard → SQL Editor → New query
3. Verify (DO $$ блок робить це автоматично — кидає exception якщо не так)

**Як перевірити після apply:**
```sql
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class WHERE relname IN ('meetings', 'meeting_syncs');
-- Expected: relrowsecurity=true, relforcerowsecurity=false (shadow)

SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('meetings', 'meeting_syncs');
-- Expected: 8 rows (4 per table)
```

## Майбутні міграції (заплановані для CRM-розширення)

- **M14+ (Stage 1.5):** `sales_line_items` таблиця + 5+ індексів + RLS. Ризик: medium (об'єм даних 240k+ рядків бекфіл).
- **M15+ (Stage 2A):** `debtors_cache` таблиця з TTL-логікою. Ризик: low.
- **M16+ (Stage 3):** `orders` + `order_items` + `order_syncs` таблиці з buffer-pattern. Ризик: medium.
- **M17+:** Перехід з shadow-mode RLS у enforce — заміна service_role на per-user JWT-сесії з `current_setting('app.login')` injection. Ризик: highest, потрібен redesign auth flow.
