# Progress

## Completed
- [x] Створено структуру папок `analytics/`, `_internal/`, `methodology/`, `system-prompt/`, `style-guide/`, `implementation/`
- [x] README.md — навігація
- [x] methodology/01-data-sources.md — структура даних, контрольні цифри
- [x] methodology/02-filters-cleaning.md — золотий фільтр, exclusions
- [x] methodology/03-segmentation.md — B2B/B2C логіка
- [x] methodology/04-cohorts-recency.md — Active/Sleeping/Lost
- [x] methodology/05-brand-filters.md — фільтри по брендах
- [x] methodology/06-buckets.md — бакети сум/упаковок
- [x] methodology/07-gotchas.md — 11 пасток
- [x] system-prompt/system-prompt.md — повний шаблон + build функція
- [x] system-prompt/query-examples.md — 7 прикладів
- [x] style-guide/excel-style.md — палітра, шрифти, чек-лист
- [x] style-guide/chat-style.md — формат markdown
- [x] implementation/00-overview.md — архітектура
- [x] implementation/01-database-schema.md — схема + индекси + RLS
- [x] implementation/02-api-design.md — endpoint, tools, security
- [x] implementation/03-ui-components.md — повний React-каркас
- [x] implementation/04-1c-integration.md — HTTP контракт
- [x] implementation/05-tasks-roadmap.md — 11 steps + 3 tracks

## Files Created (18)
- analytics/README.md
- analytics/_internal/task_plan.md
- analytics/_internal/progress.md
- analytics/methodology/01-data-sources.md
- analytics/methodology/02-filters-cleaning.md
- analytics/methodology/03-segmentation.md
- analytics/methodology/04-cohorts-recency.md
- analytics/methodology/05-brand-filters.md
- analytics/methodology/06-buckets.md
- analytics/methodology/07-gotchas.md
- analytics/system-prompt/system-prompt.md
- analytics/system-prompt/query-examples.md
- analytics/style-guide/excel-style.md
- analytics/style-guide/chat-style.md
- analytics/implementation/00-overview.md
- analytics/implementation/01-database-schema.md
- analytics/implementation/02-api-design.md
- analytics/implementation/03-ui-components.md
- analytics/implementation/04-1c-integration.md
- analytics/implementation/05-tasks-roadmap.md

## Current
Готово до review користувачем.

## Next (потенційно)
- [ ] Користувач переглядає, дає фідбек
- [ ] Можливі додавання: cross-brand analysis section, more query examples
- [ ] Передача документа розробнику що будуватиме фічу
- [ ] Видалити `_internal/` папку після затвердження

## Decisions made
- Postgres-first (не TSV) — для швидкості і дешевизни
- Sonnet 4.6 за замовчуванням, Opus 4.7 опційно
- Prompt caching для methodology context
- Generated columns у Postgres для brand/segment/is_advertising — щоб AI не вираховував їх щоразу
- SQL safety через подвійний whitelist (Node + PG function with SECURITY DEFINER)
- xlsx через `exceljs` (не openpyxl, бо Node-only)
- Шукати клієнтів іnтернет-магазину окремо — це найбільший B2C-канал для ESSE
