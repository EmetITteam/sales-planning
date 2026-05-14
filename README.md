# Supabase Backups

Автоматичні дампи БД `sales-planning`. Workflow
`.github/workflows/backup-supabase.yml` бере snapshot усіх таблиць
(`users`, `periods`, `forecasts`, `gap_closures`, `period_summaries`,
`planning_snapshots`) і комітить сюди двічі на день:

- 09:00 Київ (06:00 UTC)
- 20:00 Київ (17:00 UTC)

Кожен снапшот лежить у власній папці `backups/<UTC-timestamp>/`
разом із `manifest.json` (кількість рядків по кожній таблиці).

## Відновлення

1. Знайди потрібну дату в `backups/`.
2. Завантаж `<table>.json` файли.
3. Імпортуй у Supabase через REST/PSQL `INSERT ... ON CONFLICT DO UPDATE`.
