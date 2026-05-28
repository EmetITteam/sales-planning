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
| **TD-11** | God component `clients-page.tsx` ~1855 рядків — розбити на модулі (HeroBand, ClientsList, ClientRow, ReservedSection, BrandPlanFactTable) | `src/components/clients/clients-page.tsx` | 8-12 год | Відкрито |
| **TD-12** 🆕 | God component `planning-form.tsx` **2272 рядки** — найбільший у проекті (більший за clients-page!). Розбити. Виявлено аудитом 28.05 | `src/components/planning/planning-form.tsx` | 10-14 год | Відкрито |
| **B3** | Плоскі бейджи замість glass-chip («Без плану» `brand-row.tsx:118`, статус-pill-и у clients-page, donut-бейджи). ~39 flat `bg-*-50/100`. Прохід для glass-consistency | `dashboard/`, `planning/`, `clients/` | 3-4 год | Відкрито (підтверджено 28.05) |

---

## 🟡 P1 — найближчий тиждень

### Тех-борг

| # | Що | Файли | Зусилля | Стан |
|---|---|---|---|---|
| **TD-3** | Свіжий `DATABASE_URL` (Supabase pooler password стейлий) — `apply-migrations.mjs` не працює, кожну міграцію вручну через Dashboard | `.env` | 0.5 год | Відкрито |
| **TD-7** | Свята 2027+ — placeholder у `working-days.ts` (критично перед 31.12.2026) | `src/lib/working-days.ts:24` | 0.5 год | Відкрито |

### Bugs / Дані

| # | Що | Залежить | Стан |
|---|---|---|---|
| **B2** | Розбіжність clientStats: сума категорій (12769) ≠ totalClients (9111) у Представництвах. Категорія per-клієнт у 1С, але дані не сходяться | 1С-розробник, [SPEC_CLIENTSTATS_DISCREPANCY.md](./SPEC_CLIENTSTATS_DISCREPANCY.md) | Чекаємо Андрія |
| **Bug 2 checkActivities** | `checkActivities.hasCall` завжди false. Workaround у sales-planning — Hero Card 4 використовує bulk LastMeetingDate. Дзвінки досі недоступні bulk | 1С-розробник, [SPEC_PENDING_1C_ITEMS.md](./SPEC_PENDING_1C_ITEMS.md) | Чекаємо Андрія |

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
| **BF-2** | Edit log для M9 stage edits — хто/коли міняв stage після фіналу | 8-12 год | Відкрито |
| **BF-3** | Resnapshot для решти 15 менеджерів (зараз тільки Некова) | 2-3 год | Відкрито |
| **BF-4** | `/admin/audit` — сторінка зі всіма UPDATEами forecasts/gap_closures | 6-8 год | Відкрито |

### Нові feature-метрики з Митинг-actions (Top-5 з ARCHIVE_PLANS.md)

| # | Що | Джерело | Зусилля | Стан |
|---|---|---|---|---|
| **F-1** | «Холодні клієнти» (last touch > 30 днів) — картка на РМ-дашборді | `getClientReport.lastMeetings/lastCalls` | 3 год | Відкрито |
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
| ~~**TD-6**~~ | ~~DEPRECATED колонки forecasts.action / gap_closures.action~~ | — | ✅ **імовірно ЗАКРИТО** (28.05): не знайдено у коді/SQL. Підтвердити одним SELECT у БД |
| **TD-13** 🆕 | `company-overview-dashboard.tsx` 1176 рядків — третій god-component, теж розбити | 6-8 год | Відкрито |
| **R-1-confirm** 🆕 | Brand plan/fact extraction дублюється у 4 місцях: `brand-manager-group`, `brand-region-group`, `company-overview-dashboard`, `clients-page` (підтверджено 28.05) | — | див. R-1 вище |
| **TD-8** | Region codes (DNP/KYV/...) — заглушки, fallback на heuristic. Запитати справжні у Андрія | 2-3 год + 1С | Відкрито |

### UX

| # | Що | Зусилля | Стан |
|---|---|---|---|
| **NTH-1.1** | Збереження collapsed/expanded state регіонів між сесіями (localStorage) | 2 год | Відкрито |
| **NTH-1.2** | Keyboard shortcuts (Cmd+S, Esc для виходу з форми) | 2 год | Відкрито |
| **NTH-1.3** | Темна тема | 8-12 год | Відкрито |
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
| 🔴 P0 (критично) | 3 | 13-19 |
| 🟡 P1 (тиждень) | 6 | 7-13 |
| 🟢 P2 (місяць) | 14 | 50-70 |
| 🟢 P3 (nice) | 12 | 35-50 |
| ❓ Залежності | 4 | + час 1С / бюджет |
| **ВСЬОГО** | **39 пунктів** | **~105-152 год** |

---

_Зведено 2026-05-28 на гілці glass-redesign після merge feat/clients-page._
