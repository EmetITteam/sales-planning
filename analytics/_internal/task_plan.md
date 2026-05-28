# Task: EMET Analytics — Documentation Package

## Goal
Створити повну документацію в `sales-planning/analytics/` для AI-аналітика, який буде вбудований у проект планування продаж. Документація містить:
1. Повний контекст методології EMET-аналітики (для AI що відповідатиме на запити)
2. System prompt template (для backend що викликає Anthropic API)
3. Style guide (для звітів — Excel і чат)
4. Implementation plan (для другого асистента що будуватиме фічу)

## Steps
- [ ] README.md — навігація
- [ ] methodology/01-data-sources.md
- [ ] methodology/02-filters-cleaning.md
- [ ] methodology/03-segmentation.md
- [ ] methodology/04-cohorts-recency.md
- [ ] methodology/05-brand-filters.md
- [ ] methodology/06-buckets.md
- [ ] methodology/07-gotchas.md
- [ ] system-prompt/system-prompt.md
- [ ] system-prompt/query-examples.md
- [ ] style-guide/excel-style.md
- [ ] style-guide/chat-style.md
- [ ] implementation/00-overview.md
- [ ] implementation/01-database-schema.md
- [ ] implementation/02-api-design.md
- [ ] implementation/03-ui-components.md
- [ ] implementation/04-1c-integration.md
- [ ] implementation/05-tasks-roadmap.md

## Decisions
- **Postgres-first замість TSV** — дані синхронізуються з 1С у Supabase, AI робить SQL замість парсити TSV. Швидше, дешевше в токенах.
- **Sonnet 4.6 за замовчуванням** для більшості запитів. Opus 4.7 — лише складні аналітичні задачі (cohort, complex segmentation). Налаштовується в API route.
- **Code Execution Tool** — для дій що складно зробити в SQL (xlsx-генерація, складні pandas-операції).
- **Інтегруємо в існуючий sales-planning** — новий розділ `/admin/analytics` (поряд з analytics-preview що вже існує).

## Files to Modify (in sales-planning)
- Нових: src/app/admin/analytics/* (UI), src/app/api/analytics/chat/route.ts (backend)
- Migrations: нова таблиця `sales` у Supabase
- env: ANTHROPIC_API_KEY

## Risks
- 1С HTTP-сервіс залежить від програмістів 1С — паралельний трек, не блокує MVP
- Vercel timeout 60s на serverless route — для довгих аналізів треба streaming або background job
- Anthropic API rate limits — врахувати в error handling
