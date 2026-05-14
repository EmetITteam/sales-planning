# Backups — стратегія резервного копіювання БД

Налаштовано 2026-05-14. Supabase Free plan **не має managed backups**, тому всі дампи робимо самі.

## Архітектура

```
┌─────────────────────┐  cron 06:00 + 17:00 UTC
│  GitHub Actions     │  (09:00 + 20:00 Київ)
│  backup-supabase.yml│
└──────────┬──────────┘
           │ запускає
           ▼
┌─────────────────────┐
│ scripts/            │  REST GET на 6 таблиць
│ backup-supabase.mjs │  з SERVICE_ROLE key
└──────────┬──────────┘
           │ JSON dump
           ▼
┌─────────────────────┐
│  гілка `backups`    │  кожен snapshot — окремий commit
│  у тому ж репо      │  backups/<UTC-timestamp>/*.json
└─────────────────────┘
```

## Розклад

| Час (Київ) | Час (UTC) | Призначення |
|---|---|---|
| 09:00 | 06:00 | ранковий snapshot перед робочим днем |
| 20:00 | 17:00 | вечірній snapshot після закриття дня |

⚠️ GitHub Actions cron може спізнюватись 5-15 хв при високому навантаженні платформи — норма.

## Що бекапиться

Список таблиць у [`scripts/backup-supabase.mjs`](../scripts/backup-supabase.mjs) (масив `TABLES`):

- `users` — користувачі (PIB, region, role)
- `periods` — місячні плани продажів (бренд × сума)
- `forecasts` — прогноз менеджера по клієнтам
- `gap_closures` — план закриття розриву
- `period_summaries` — finalize стан + gap actions
- `planning_snapshots` — одноразова фіксація списку клієнтів при першому збереженні

**При створенні нової таблиці — додавати її у `TABLES`, інакше backup пропустить.**

## Де лежить

- **Гілка:** [`backups`](https://github.com/EmetITteam/sales-planning/tree/backups) у репо `EmetITteam/sales-planning`
- **Структура:** `backups/<UTC-timestamp>/`
- **У кожній папці:** `<table>.json` × 6 + `manifest.json` (row counts + timestamp)

Приклад snapshot: `backups/2026-05-14T11-51-01Z/`

## Як відновити

### Вся БД з конкретної дати

1. Зайти на [гілку backups](https://github.com/EmetITteam/sales-planning/tree/backups), знайти потрібну дату
2. Завантажити всі `*.json` файли з тієї папки
3. Імпортувати у Supabase:

```bash
# Локально — встанови URL + service_role у .env, тоді:
node scripts/restore-from-backup.mjs backups/2026-05-14T11-51-01Z/
```

(Restore-скрипт ще не написаний — створити коли реально знадобиться. Підказка: REST PATCH з `Prefer: resolution=merge-duplicates` робить UPSERT.)

### Точкове відновлення (один рядок)

Відкрити потрібний `*.json` у GitHub UI → знайти запис по `id` → копіювати в Supabase Table Editor.

## Ручний запуск (поза кроном)

Перед DDL міграцією — завжди запускати **локально**, щоб мати свіжий snapshot:

```bash
node scripts/backup-supabase.mjs
# → backups/2026-MM-DDTHH-MM-SSZ/  (локально, не у git)
```

Локальний дамп лишається на диску — у git не комітиться (`.gitignore` блокує `/backups/` на master).

Якщо хочеш зафорсити автозапуск (наприклад, перед ризикованою зміною):

- [github.com/EmetITteam/sales-planning/actions/workflows/backup-supabase.yml](https://github.com/EmetITteam/sales-planning/actions/workflows/backup-supabase.yml) → кнопка **Run workflow**

## Required secrets (GitHub Actions)

Settings → Secrets and variables → Actions:

- `NEXT_PUBLIC_SUPABASE_URL` — URL проекту з [Supabase Dashboard → Settings → API](https://supabase.com/dashboard/project/_/settings/api)
- `SUPABASE_SERVICE_ROLE_KEY` — legacy `service_role` (не новий «Secret API key» — наш код ще не адаптований)

## Vercel и гілка backups

Vercel за замовчуванням деплоїть **усі** гілки як preview. На гілці `backups` нема Next.js джерел, тому деплой би падав. Запобігаємо: на самій гілці `backups` лежить мінімальний `vercel.json`:

```json
{
  "git": {
    "deploymentEnabled": false
  }
}
```

Workflow `backup-supabase.yml` створює його автоматично при першому orphan-init. Master `vercel.json` залишається з production buildCommand — на нього настройка не впливає.

## Обсяг і ретеншн

- Один snapshot ≈ **13 MB** (станом на 2026-05-14)
- 2 × день × 30 днів = **~800 MB/місяць**
- GitHub витримає, але через ~12 місяців варто заархівувати старі: лишити останні 90 днів + перший snapshot від місяця для довгої історії

**TODO** (коли об'єм буде заважати): додати у workflow `cleanup`-крок який видаляє snapshots старші 90 днів (зберігаючи перший від місяця).

## Чого НЕ робити

- ❌ Не казати «робіть backup через Supabase Dashboard» — на Free plan недоступно
- ❌ Не покладатись лише на auto-backup перед DDL — він може бути 11 год давний; завжди дублювати ручним `node scripts/backup-supabase.mjs`
- ❌ Не комітити локальні `backups/` у master — `.gitignore` це блокує, не обходити
- ❌ Не публікувати `SUPABASE_SERVICE_ROLE_KEY` у коді чи preview-environment-variables — тільки у `.env` локально та у GitHub Secrets

## Файли проекту

| Файл | Призначення |
|---|---|
| [`scripts/backup-supabase.mjs`](../scripts/backup-supabase.mjs) | Сам backup-скрипт, працює і локально, і у CI |
| [`.github/workflows/backup-supabase.yml`](../.github/workflows/backup-supabase.yml) | GitHub Actions workflow з кроном |
| `vercel.json` (на гілці `backups`) | Блокує Vercel preview-деплой гілки |
