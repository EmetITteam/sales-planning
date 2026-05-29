# EMET Analytics — AI-аналітик для продажів

Вбудована фіча в `sales-planning` проект. Користувач у чат-інтерфейсі задає питання про продажі ("скільки сплячих ESSE", "розподіл по чеках Vitaran 2026"), система викликає Anthropic API з контекстом про EMET-методологію, AI пише SQL/Python і повертає відповідь з таблицями/файлами.

## Навігація

### `methodology/` — методологія для AI-аналітика
Передається в system prompt при кожному запиті. Описує **як рахувати** для EMET.

- [01-data-sources.md](methodology/01-data-sources.md) — структура даних (1С → Supabase), колонки
- [02-filters-cleaning.md](methodology/02-filters-cleaning.md) — exclusions: реклама, саше, sum<$5, повернення
- [03-segmentation.md](methodology/03-segmentation.md) — B2B vs B2C логіка (підрозділи)
- [04-cohorts-recency.md](methodology/04-cohorts-recency.md) — активні / сплячі / втрачені (90/180 днів)
- [05-brand-filters.md](methodology/05-brand-filters.md) — як ідентифікувати ESSE, Vitaran, Collagen, PETARAN, ELLANSE
- [06-buckets.md](methodology/06-buckets.md) — бакети по сумі і кількості
- [07-gotchas.md](methodology/07-gotchas.md) — пастки (дата-фільтр, NBSP, "Итог")

### `system-prompt/` — як викликати API
- [system-prompt.md](system-prompt/system-prompt.md) — повний system prompt template
- [query-examples.md](system-prompt/query-examples.md) — приклади запитів → відповідей

### `style-guide/` — стиль відповідей
- [excel-style.md](style-guide/excel-style.md) — EMET-стиль для xlsx (#066AAB, Cambria)
- [chat-style.md](style-guide/chat-style.md) — формат текстової відповіді (markdown, таблиці)

### `implementation/` — для розробника
- [00-overview.md](implementation/00-overview.md) — архітектура
- [01-database-schema.md](implementation/01-database-schema.md) — таблиця `sales` у Supabase
- [02-api-design.md](implementation/02-api-design.md) — `/api/analytics/chat`
- [03-ui-components.md](implementation/03-ui-components.md) — chat UI
- [04-1c-integration.md](implementation/04-1c-integration.md) — HTTP-сервіс для sync
- [05-tasks-roadmap.md](implementation/05-tasks-roadmap.md) — крок за кроком

## Як це працює

```
Користувач → Chat UI (/admin/analytics)
              ↓ message
         /api/analytics/chat
              ↓
   Anthropic API (Claude Sonnet 4.6)
   + system prompt (methodology/* зібрано)
   + Code Execution Tool (Python)
   + SQL tool (Supabase Postgres)
              ↓
        Відповідь: текст + таблиця + опційно xlsx
```

## Ключові принципи

1. **Дані у Postgres, не TSV** — 1С шле HTTP daily, AI робить SQL замість парсити файли
2. **System prompt — єдине джерело правди про методологію** — змінити логіку = редагувати markdown тут
3. **EMET-стиль обов'язковий** — будь-який xlsx-вихід форматується автоматично через бібліотечну функцію
4. **Sonnet за замовчуванням, Opus для важких** — економимо токени
5. **Streaming відповідей** — користувач бачить як AI міркує і пише

## Власник
IT Director EMET. Документація живий артефакт — оновлюється при будь-якій зміні методології.
