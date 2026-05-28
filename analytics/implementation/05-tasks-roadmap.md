# 05 · Tasks Roadmap

Покрокова реалізація. Кожен крок — ~2-4 години. Дві паралельних треки: Backend (Next.js + Supabase) і 1С (HTTP service). Залежності позначено.

## Track A · Backend і UI

### Step 1. Підготовка інфраструктури
**Estimate:** 1 год
**Depends:** —

- [ ] Додати ENV variables у Vercel (`ANTHROPIC_API_KEY`, `ONEC_SYNC_TOKEN`, `ANTHROPIC_MODEL_*`)
- [ ] Створити Anthropic API key в [console.anthropic.com](https://console.anthropic.com), додати $50 на старт
- [ ] Перевірити що Vercel runtime — Node 22.x
- [ ] Створити Supabase Storage bucket `analytics-exports` (public-read, 7d expiry)

**Acceptance:** `console.log(process.env.ANTHROPIC_API_KEY)` повертає значення на Vercel.

---

### Step 2. Database schema
**Estimate:** 2 год
**Depends:** —

- [ ] Створити migration `XXXX_create_sales_table.sql` — таблиця `sales` з generated columns
- [ ] Створити migration `XXXX_create_sales_indexes.sql`
- [ ] Створити migration `XXXX_create_materialized_view.sql` — `client_last_purchase`
- [ ] Створити `analytics_queries` і `sales_sync_log` таблиці
- [ ] Створити функцію `execute_select(sql_query)` з GRANT тільки service_role
- [ ] Включити `pg_trgm` extension

**Acceptance:** `SELECT execute_select('SELECT 1+1 AS x')` повертає `[{x: 2}]`.

---

### Step 3. Backfill з існуючої TSV
**Estimate:** 2-3 год
**Depends:** Step 2

- [ ] Написати `scripts/backfill-from-tsv.ts` — bun/tsx script
- [ ] Логіка парсингу з `product-analytics/scripts/_collagen_unique_clients.py` (Python як референс)
- [ ] Batch insert по 1000 рядків
- [ ] Verify: `SUM(sum_usd) WHERE sum > 0 = 14_090_139.03`
- [ ] REFRESH MATERIALIZED VIEW `client_last_purchase`

**Acceptance:** `SELECT COUNT(DISTINCT client_code) FROM sales WHERE sum_usd > 0` = 6 867.

---

### Step 4. SQL safety runner
**Estimate:** 2 год
**Depends:** Step 2

- [ ] `src/lib/analytics/sql-runner.ts` з whitelist SELECT/WITH
- [ ] Перевірка на multiple statements, FORBIDDEN_KEYWORDS
- [ ] Виклик через RPC `execute_select`
- [ ] Тести: 10+ test cases (SELECT ok, INSERT rejected, DROP rejected, sub-SELECT ok)

**Acceptance:** Unit-tests проходять. Спроба `DROP TABLE sales` → throw.

---

### Step 5. System prompt builder
**Estimate:** 1 год
**Depends:** —

- [ ] `src/lib/analytics/system-prompt.ts`
- [ ] `buildSystemPrompt()` — читає `analytics/system-prompt/system-prompt.md`, повертає текст з code block
- [ ] `loadMethodologyContext()` — комбінує усі `methodology/*.md`
- [ ] Cache в-пам'яті (LRU) — щоб не читати файли на кожен запит

**Acceptance:** `console.log(buildSystemPrompt())` довжина > 2000 символів, містить ключові слова "REF_DATE", "сплячий", "Vitaran".

---

### Step 6. Tool definitions
**Estimate:** 2 год
**Depends:** Step 4, Step 5

- [ ] `src/lib/analytics/tools.ts`
- [ ] `querySalesTool` (Zod schema, run delegate)
- [ ] `exportXlsxTool` (Zod schema, run delegate — спершу stub що повертає `{ url: 'TODO' }`)
- [ ] `runPythonTool` — на MVP опційно (можна без)

**Acceptance:** Інтеграційний тест: створити Anthropic клієнт, передати `querySalesTool`, спитати "скільки рядків в sales" → toolRunner викликає query_sales, повертає число.

---

### Step 7. Chat API endpoint (без UI)
**Estimate:** 4 год
**Depends:** Step 5, Step 6

- [ ] `src/app/api/analytics/chat/route.ts`
- [ ] SSE streaming
- [ ] Інтеграція з `anthropic.beta.messages.toolRunner`
- [ ] Prompt caching на methodology
- [ ] Логування в `analytics_queries`
- [ ] Cost calculation
- [ ] Error handling

**Acceptance:** POST через curl з message "скільки сплячих ESSE B2B?" → SSE відповідь з SQL і таблицею.

---

### Step 8. Excel export (EMET style)
**Estimate:** 3-4 год
**Depends:** Step 7

- [ ] `src/lib/analytics/excel-export.ts`
- [ ] Використати `exceljs` (npm) — підтримує усі стилі що нам треба
- [ ] Helper functions: `applyEmetTitleStyle()`, `applyEmetHeaderStyle()`, `applyZebraFill()`
- [ ] Upload до Supabase Storage, повернути public URL
- [ ] Unit-tests: відкрити згенерований файл, перевірити що шапка має color `066AAB`

**Acceptance:** Генерація 100-рядкового файлу → відкривається в Excel, виглядає як `scripts/petaran_cohorts_2025_2026.py` output.

---

### Step 9. Chat UI
**Estimate:** 6-8 год
**Depends:** Step 7

- [ ] `src/app/admin/analytics/page.tsx` — server component з auth
- [ ] `ChatInterface.tsx` — client component
- [ ] `MessageBubble.tsx` з react-markdown
- [ ] `ChatInput.tsx` з model toggle
- [ ] `EmptyState.tsx` з підказками
- [ ] `TableRenderer.tsx` для красивих таблиць
- [ ] `CodeBlock.tsx` з syntax highlighting (shiki або prism-react-renderer)
- [ ] Підключення до SSE стріму

**Acceptance:** Smoke test з [03-ui-components.md](03-ui-components.md) проходить.

---

### Step 10. Auth і permissions
**Estimate:** 1-2 год
**Depends:** Step 9

- [ ] У `getCurrentUser()` додати поле `permissions` (з існуючої таблиці)
- [ ] Створити permission `analytics` у `admin/permissions` UI
- [ ] Дати тільки IT Director і обраним директорам
- [ ] Redirect на `/` якщо немає permission

**Acceptance:** Незареєстрований → /login. Без permission → 403 page.

---

### Step 11. Monitoring і usage
**Estimate:** 2 год
**Depends:** Step 7

- [ ] `/api/analytics/usage` endpoint (cost per user per month)
- [ ] Простий дашборд `/admin/analytics-usage` для адміна
- [ ] Email-алерт якщо витрати > $100/місяць (через Resend)

**Acceptance:** Видно витрати у $.

---

## Track B · 1С integration (паралельно)

### Step B1. HTTP-сервіс у 1С
**Estimate:** 2-3 дні (1С-програмістам)
**Depends:** Step 1 (token треба)

Дати програмістам 1С спеку з [04-1c-integration.md](04-1c-integration.md). Вони пишуть HTTP-сервіс, додають у Cron 1С.

**Acceptance:** Тестовий POST з 10 рядками успішно проходить.

---

### Step B2. Daily sync endpoint
**Estimate:** 3 год
**Depends:** Step 2, Step B1

- [ ] `src/app/api/sales-sync/route.ts`
- [ ] Перевірка Bearer токена
- [ ] Валідація payload через Zod
- [ ] Bulk upsert у `sales`
- [ ] REFRESH MATERIALIZED VIEW (concurrently)
- [ ] Логування в `sales_sync_log`

**Acceptance:** 1С шле батч 1000 рядків → у Postgres з'являються (або апдейтяться).

---

### Step B3. Sync monitoring
**Estimate:** 2 год
**Depends:** Step B2

- [ ] `/admin/sales-sync-status` сторінка
- [ ] Графік за 30 днів
- [ ] Email якщо days_behind > 2

---

## Track C · Поліровка (після MVP)

### Step C1. Історія запитів
**Estimate:** 3 год
- [ ] Sidebar з minulymi запитами користувача
- [ ] Клік → відкрити старий чат
- [ ] Видалити (privacy)

### Step C2. Telegram нотифікації
**Estimate:** 4 год
- [ ] Користувач може зберегти запит як "розклад"
- [ ] Cron щодня запускає → результат у Telegram-бот

### Step C3. Saved queries / Templates
**Estimate:** 3 год
- [ ] Стандартні запити як "шаблони"
- [ ] Quick-access у sidebar

### Step C4. Mobile-optimized
**Estimate:** 4 год
- [ ] Окремий мобільний layout
- [ ] PWA installable

---

## MVP scope (мінімум для запуску)

✅ Step 1-10 і B1-B3 = ~30-40 годин роботи розробника + 2-3 дні 1С.

📅 **Орієнтовно:** 1.5-2 тижні до beta-релізу.

🎯 **Beta acceptance:** користувачка задає 10 типових питань → отримує правильні відповіді з тими ж цифрами що в product-analytics скриптах.

## Definition of Done (для кожного step)

- [ ] Код написаний і працює локально
- [ ] Unit/integration test пройшов (де треба)
- [ ] Lint і typecheck без помилок
- [ ] PR review (якщо є другий розробник)
- [ ] Merged у main → автодеплой Vercel → smoke test на проді
- [ ] Documented in `progress.md`

## Estimation summary

| Track | Effort | Owner |
|---|---|---|
| Track A (Backend + UI) | 30-40 годин | основний розробник |
| Track B (1С integration) | 2-3 дні | 1С-програмісти |
| Поліровка (опційно) | 14+ годин | пізніше |

**Загалом до MVP:** ~2 тижні календарних.
