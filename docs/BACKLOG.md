# Backlog Sales Planning

Чинні пендинги після завершення feat/clients-page (2026-05-28). Структура за пріоритетом + категорією.

Дивись також:
- [SPEC_PENDING_1C_ITEMS.md](./SPEC_PENDING_1C_ITEMS.md) — pending специфікації до 1С
- [SPEC_CLIENTSTATS_DISCREPANCY.md](./SPEC_CLIENTSTATS_DISCREPANCY.md) — open question по Action 5 clientStats
- [ARCHIVE_PLANS.md](./ARCHIVE_PLANS.md) — виконані плани

Пріоритети:
- **P0** — критично, наступний день/тиждень
- **P1** — найближчий тиждень
- **P2** — найближчий місяць
- **P3** — Nice-to-have, коли буде час

---

## 🔴 P0 — критично

| # | Що | Файли | Зусилля | Стан |
|---|---|---|---|---|
| ~~**B1**~~ | ~~Director Dashboard race condition~~ | — | — | ✅ **ЗАКРИТО** (верифіковано 28.05): auto-retry 3× backoff у `use-onec-data.ts:71-79` вже покриває cold-start |
| ~~**B3**~~ ⭐ | ~~Плоскі бейджи замість glass-chip~~ | — | — | ✅ **ЗАКРИТО** (28.05, `c3862af`): статус-бейджи у format.ts (traffic/prob), planning-form, client-search-modal, company-overview, planning-readiness, app-header, clients-page, brand-row, manager-accordion переведено на glass-chip (`bg-*-500/12 + border + backdrop-blur`). Icon-фони/банери/hover — лишено |

> **Розбиття god-components (TD-11 clients-page 1855, TD-12 planning-form 2272, TD-13 company-overview 1176) — відкладено до v3** (наступний повний редизайн продукту, рішення 28.05). Не чіпаємо до того.

---

## 🟡 P1 — найближчий тиждень

### Тех-борг

| # | Що | Файли | Зусилля | Стан |
|---|---|---|---|---|
| **TD-3** | Свіжий `DATABASE_URL` (Supabase pooler password стейлий) — `apply-migrations.mjs` не працює, кожну міграцію вручну через Dashboard | `.env` | 0.5 год | Відкрито |

### Bugs / Дані

| # | Що | Залежить | Стан |
|---|---|---|---|
| ~~**B2**~~ | ~~Розбіжність clientStats~~ | — | ✅ **ЗАКРИТО** (27.05): 1С виправив, дані сходяться |
| ~~**Bug 2 checkActivities**~~ | ~~hasCall завжди false~~ | — | ✅ **ЗАКРИТО** (27.05): 1С виправив, дзвінки приходять через checkActivities. Card 4 використовує checkActivities напряму |

### Тести

| # | Що | Файли | Зусилля | Стан |
|---|---|---|---|---|
| **T-1** | Tests для `useClientsTotals` (batching logic — chunk 1/2/3 по 400 клієнтів) | новий `tests/use-clients-totals.test.ts` | 3-4 год | Відкрито |
| **T-2** | Tests для `useClientFocuses` (chunk 200, до 600 ID) | новий `tests/use-client-focuses.test.ts` | 2 год | Відкрито |

---

## 🟢 P2 — найближчий місяць

### Тех-борг

| # | Що | Файли | Зусилля | Стан |
|---|---|---|---|---|
| **TD-5** | `SEGMENTS` (production constant) живе у `mock-data.ts` разом з DEMO mock-функціями — винести у `src/lib/segments.ts` | `src/lib/mock-data.ts` | 1-2 год | Відкрито |
| **TD-2** | `MULTI_REGION_RM_OVERRIDES/HOME` — hardcoded на 1 юзера. Винести у БД таблицю | `src/lib/feature-flags.ts:67-87` | 6-8 год | Відкрито |

### Рефакторинг

| # | Що | Файли | Зусилля | Стан |
|---|---|---|---|---|
| **R-1** | Refactor PlanFactByBrand-style data extraction у спільний hook (зараз дублюється у clients-page + manager-dashboard + planning-form) | `src/lib/use-plan-fact-by-brand.ts` (новий) | 4-6 год | Відкрито |
| **B4** | Tooltip-помічники для метрик («що таке Прогноз/темп?», «що таке Норма на сьогодні?») | dashboard components | 3-4 год | Відкрито |

### Backlog фічі (з попереднього backlog 19.05)

| # | Що | Зусилля | Стан |
|---|---|---|---|
| ~~**BF-1**~~ | ~~«Запл. 0% · $0» у regional-accordion~~ | — | ✅ **ЗАКРИТО** (верифіковано 28.05): `region-accordion.tsx:239-247` показує завжди |

### Нові feature-метрики з Митинг-actions (Top-5 з ARCHIVE_PLANS.md)

| # | Що | Джерело | Зусилля | Стан |
|---|---|---|---|---|
| ~~**F-1**~~ | ~~«Холодні клієнти» (last touch > 30 днів)~~ | — | — | ❌ **НЕ робимо** (рішення 28.05) |
| **F-2** | Авто-prefill прогнозу з 3-міс історії у формі планування | `getClientReport.salesReport.brands.salesByMonth` | 6 год | Відкрито |
| **F-3** | «Активні + нема контактів» — картка на менеджерському дашборді | `getAllMeetingsForClient` + наш plan | 2 год | Відкрито |
| **F-4** | Conversion: дзвінки/зустрічі → продажі (admin KPI) | кореляція дат + Action 5 факт | 5 год | Відкрито |
| **F-5** | «Втрата якорного бренду» — детект «3 з 3 → 0 цього міс» | `getClientReport.salesReport.brands.salesByMonth` | 3 год | Відкрито |

---

## 🟢 P3 — Nice-to-have

### Тех-борг

| # | Що | Зусилля | Стан |
|---|---|---|---|
| **TD-4** | RLS вимкнено, скрізь service_role bypass — увімкнути політики | 20-30 год | Відкрито (P0 якщо публічний доступ) |
| ~~**TD-6**~~ | ~~DEPRECATED колонка `gap_closures.action`~~ | — | ✅ **ЗАКРИТО** (28.05, міграція `20260528_012`): DROP COLUMN застосовано через Dashboard. Знайшлось 5 non-null (демо-логін feshchenko@emet.com — моки, не реальні), бекап перед DROP. `forecasts.action` + `gap_closures.action` обидві дропнуто |
| **TD-8** | Region codes (DNP/KYV/...) — заглушки, fallback на heuristic. Запитати справжні у Андрія | 2-3 год + 1С | Відкрито |

### UX

| # | Що | Зусилля | Стан |
|---|---|---|---|
| **NTH-1.1** | Збереження collapsed/expanded state регіонів між сесіями (localStorage) | 2 год | Відкрито |
| **NTH-1.2** | Keyboard shortcuts (Cmd+S, Esc для виходу з форми) | 2 год | Відкрито |
| **NTH-1.4** | Friendly URL за регіоном (`/region/KYV`) | 4 год | Відкрито |

### Infrastructure

| # | Що | Зусилля | Стан |
|---|---|---|---|
| **NTH-2** | Sentry для error tracking (зараз тільки console.error у Vercel logs) | 4-6 год setup + $26/міс | Відкрито |
| **NTH-3** | Playwright у CI (зараз qa-review.mjs ручний) | 4 год | Відкрито |
| **NTH-4** | Performance audit (Lighthouse, bundle size, slow queries) | 4-6 год | Відкрито |
| **NTH-5** | README + architecture diagram (для bus factor) | 4-6 год | Частково зроблено (README рідактнуто 28.05) |
| **NTH-6** | Per-(manager × segment) granularity для M9 (зараз тільки per-manager) | 6-8 год | Відкрито |
| **NTH-7** | Vercel Pro features — Speed Insights + Web Analytics | 0.5 год | Відкрито |
| **NTH-8** | Vercel Cron — перенести `backup-supabase.yml` з GitHub Actions на Vercel Cron | 1 год | Відкрито |
| **NTH-9** | Vercel Preview password protection — закрити preview-deploys паролем | 0.25 год | Відкрито |

---

## ❓ Залежності (зовнішні)

| # | Що | Залежить | Стан |
|---|---|---|---|
| **EXT-1** | 1С Action 2 — повна історія продажів за період (зараз тільки latest дата) | 1С-розробник | Відкрито |
| **EXT-2** | Supabase Pro план ($25/міс) для PITR + більше БД | Бюджет | Моніторити |
| **EXT-3** | Vercel Pro якщо команда зросте >100 чол | Бюджет | Відкрито |
| **EXT-4** | 1С v2.6 Action 5 `boughtBySegment` — категорія × бренд breakdown (matrix «20 активних купили VITARAN, 15 — ESSE…») | 1С-розробник | Спека потрібна |

---

## 📊 Підсумок

| Категорія | Пунктів | Годин (оцінка) |
|---|---|---|
| 🔴 P0 (критично) | 0 відкрито (B1+B3 ✅, TD-11/12/13 → v3) | — |
| 🟡 P1 (тиждень) | 3 (TD-3, T-1, T-2) | 5.5-9.5 |
| 🟢 P2 (місяць) | 14 | 50-70 |
| 🟢 P3 (nice) | 12 | 35-50 |
| ❓ Залежності | 4 | + час 1С / бюджет |
| **ВСЬОГО** | **~33 відкритих** | **~90-130 год** |

---

_Зведено 2026-05-28 на гілці glass-redesign після merge feat/clients-page._
