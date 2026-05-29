# 00 · Implementation Overview

> Цей файл і решта в `implementation/` — для AI-асистента (Cursor/Claude/etc) що буде кодити фічу. Стиль — конкретні файли, конкретні рядки, конкретні залежності.

## Що будуємо

AI-аналітичний чат, вбудований у `sales-planning` як новий розділ `/admin/analytics`. Користувач у чаті задає питання про продажі → backend викликає Anthropic API → AI пише SQL/Python → відповідь з таблицями і опційно xlsx.

## Архітектура

```
┌────────────────────────────────────────────────────────────────┐
│  sales-planning (Next.js 16, Vercel)                            │
│                                                                  │
│  src/app/admin/analytics/page.tsx       ← Chat UI                │
│              │                                                   │
│              │ POST /api/analytics/chat (SSE streaming)          │
│              ▼                                                   │
│  src/app/api/analytics/chat/route.ts    ← Backend handler        │
│              │                                                   │
│              ├──► Anthropic SDK (Sonnet 4.6 default)             │
│              │     + system prompt (build from /analytics/*.md) │
│              │     + tools: query_sales, run_python, export_xlsx│
│              │                                                   │
│              ├──► Supabase Postgres → table 'sales'              │
│              │                                                   │
│              └──► Supabase Storage → xlsx files                 │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
                                ▲
                                │ HTTP POST (daily sync)
                                │
┌────────────────────────────────────────────────────────────────┐
│  1С УТП (EMET ERP)                                              │
│  HTTP-сервіс: вигрузка продажів за останню добу                 │
└────────────────────────────────────────────────────────────────┘
```

## Ключові залежності (нові)

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.40.0",        // Anthropic API клієнт
    "@anthropic-ai/sdk/helpers/beta/zod": "*"  // tool helpers
  }
}
```

**Не додавати:** `@supabase/supabase-js` (заборонено в проектах CLAUDE.md — Turbopack не резолвить). Використовуємо REST через fetch (як уже зроблено в проекті sales-planning).

## Папки які треба створити

```
src/app/admin/analytics/
├── page.tsx                          # Chat UI
├── ChatInterface.tsx                 # Client component
├── MessageBubble.tsx
├── TableRenderer.tsx                 # Markdown table → styled HTML
└── CodeBlock.tsx                     # SQL/Python syntax highlight

src/app/api/analytics/
├── chat/route.ts                     # POST endpoint, SSE response
├── sql/route.ts                      # Internal: AI tool → query_sales
└── export/route.ts                   # Internal: AI tool → xlsx

src/lib/analytics/
├── system-prompt.ts                  # Build system prompt from .md
├── anthropic-client.ts               # Singleton SDK client
├── tools.ts                          # Tool definitions (Zod schemas)
├── sql-runner.ts                     # Safe SQL execution (SELECT only)
├── excel-export.ts                   # EMET-styled xlsx generator
└── python-sandbox.ts                 # Code Execution Tool wrapper

src/app/api/sales-sync/route.ts       # 1С → Postgres (HTTP receive)

supabase/migrations/
├── XXXX_create_sales_table.sql
└── XXXX_create_sales_indexes.sql
```

## Environment variables

Додати в `.env.local` (і Vercel):
```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL_DEFAULT=claude-sonnet-4-6
ANTHROPIC_MODEL_HEAVY=claude-opus-4-7

ONEC_SYNC_TOKEN=...           # 1С шле з цим Bearer-токеном (HMAC або random secret)

# Уже існуючі — Supabase
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Vercel налаштування

- **Region:** Frankfurt (`fra1`) — ближче до 1С-сервера в Україні
- **Runtime:** `nodejs22.x` (НЕ 24.x, явна заборона у CLAUDE.md)
- **Maximum duration:** `60` секунд для `/api/analytics/chat` (за замовчуванням 10 — недостатньо для streaming з multiple tool calls)
- **Stream-friendly:** Vercel Edge Runtime НЕ використовувати (Anthropic SDK дає кращий DX у Node)

## Послідовність реалізації

1. **Database first** (Migration) — щоб дані були. Див. `01-database-schema.md`.
2. **Backend skeleton** — без AI, просто endpoint що повертає mock. Перевірити streaming.
3. **System prompt builder** — `src/lib/analytics/system-prompt.ts`.
4. **Tools** — `query_sales`, `run_python`, `export_xlsx` як Zod-tools.
5. **AI integration** — підключити Anthropic SDK у `chat/route.ts`.
6. **UI** — chat interface, messages, code highlighting.
7. **xlsx export** — EMET style.
8. **1С integration** — окремий ендпоінт для daily sync.

Детальний todo — у `05-tasks-roadmap.md`.

## Тестування

- **Backfill test:** після створення таблиці і завантаження TSV — порівняти контрольні цифри з [methodology/01-data-sources.md](../methodology/01-data-sources.md). Якщо $14M контрольна сума не сходиться — діагностувати.
- **Smoke test SQL tool:** "скільки усього клієнтів?" → має повернути 6 867.
- **Smoke test AI:** "скільки сплячих ESSE B2B" → має дати 190.
- **xlsx test:** генерація → відкрити в Excel і перевірити що відкривається без `#ИМЯ?` і `#REF`.

## Подальша еволюція

Після MVP — додавати:
- Збережені запити ("Збережи цей звіт як шаблон")
- Розклад "щоранку показуй мені сплячих за останній тиждень"
- Telegram-нотифікації при суттєвих змінах метрик
- Розширений UI зі статичними дашбордами для KPI

Але це **не** входить у MVP.
