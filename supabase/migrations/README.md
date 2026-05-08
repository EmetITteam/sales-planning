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
| 2026-05-08 | `20260508_001_add_indices.sql` | Індекси для швидших queries | ⏳ pending |
| 2026-05-08 | `20260508_002_drop_dead_columns.sql` | Видалити legacy `month_forecast_pct/usd` з period_summaries | ⏳ pending |
| 2026-05-08 | `20260508_003_unpack_stage_comment.sql` | JSON-pack у text колонках → дедіковані колонки training_id/name/date + stage_done | ⏳ pending |

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

- **M4:** `users.id integer → TEXT PK` (login as PK, прибрати loginToUserId hash). Ризик: high.
- **M5:** Row Level Security policies + JWT-based auth замість service_role. Ризик: highest, потрібен redesign auth flow.
