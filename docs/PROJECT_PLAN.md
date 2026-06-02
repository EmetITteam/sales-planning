# Sales-Planning → EMET CRM
## Комплексний план доробки проекту

**Версія:** v2 (consolidated) · **Дата:** 2026-06-02 · **Етап:** 0 (Архітектура + Дизайн)
**Автор плану:** IT Director EMET (заказчик) + команда фронтенд-розробки
**Аудиторія цього документа:** заказчик, 1С-розробники, фронтенд, ITD.
**Для керівництва:** є похідний документ `docs/EXECUTIVE_SUMMARY.md` — менш технічний, для затвердження.

**Supporting docs (історичні / детальні):**
- `docs/planning/decisions.md` — реєстр ADR (тут вони продубльовані повним списком)
- `docs/planning/findings.md` — повні аудити meeting-4.0, meeting-app, reclamation-app
- `docs/planning/stage-1.5-sales-detail.md` — детальна спека Sales Detail
- `docs/planning/best-manager-spec.md` — детальна спека Best Manager алгоритму
- `docs/planning/progress.md` — sprint-tracker
- `docs/1C_NEW_ACTIONS_SPEC.md` — буде створено після затвердження цього плану

---

# Зміст

1. [Vision і стратегічні цілі](#1-vision-і-стратегічні-цілі)
2. [Поточний стан (baseline)](#2-поточний-стан-baseline)
3. [Стратегічна карта — 6 етапів](#3-стратегічна-карта--6-етапів)
4. [Технологічний стек і архітектура](#4-технологічний-стек-і-архітектура)
5. [Каталог архітектурних рішень (ADR-1..17)](#5-каталог-архітектурних-рішень-adr-117)
6. [Аудити вихідних систем](#6-аудити-вихідних-систем)
7. [Етап 0 — Architecture + Design Prep](#7-етап-0--architecture--design-prep)
8. [Етап 1 — Зустрічі (Meetings)](#8-етап-1--зустрічі-meetings)
9. [Етап 1.5 — Sales Detail Data Foundation](#9-етап-15--sales-detail-data-foundation)
10. [Best Manager Analytics (1.5.6)](#10-best-manager-analytics)
11. [Етап 2A — Дебіторка (Receivables)](#11-етап-2a--дебіторка-receivables)
12. [Етап 2B — Рекламації (Reclamations)](#12-етап-2b--рекламації-reclamations)
13. [Етап 3 — Замовлення / Реалізації (Orders)](#13-етап-3--замовлення--реалізації-orders)
14. [Cross-cutting concerns](#14-cross-cutting-concerns)
15. [Risk Register (top 15)](#15-risk-register-top-15)
16. [Timeline і ресурси](#16-timeline-і-ресурси)
17. [Зовнішні залежності](#17-зовнішні-залежності)
18. [Витрати (cost implications)](#18-витрати-cost-implications)
19. [Закриті рішення (Q1-Q7) і відкриті питання](#19-закриті-рішення-q1-q7-і-відкриті-питання)
20. [Глосарій](#20-глосарій)

---

# 1. Vision і стратегічні цілі

## 1.1 Vision

Перетворити `sales-planning` з інструменту планування продажів у **повноцінну CRM-систему EMET** для всього відділу продажу. Зараз — 3 модулі у проді (Планування / Мої клієнти / Огляд компанії). Після розширення — **повний робочий інструмент менеджера**: зустрічі, замовлення, дебіторка, рекламації + автоматизована аналітика для керівництва.

## 1.2 Стратегічні цілі (business outcomes)

| Ціль | Як вимірюємо |
|---|---|
| **Винести роботу менеджерів з 1С у наш UI** | % часу менеджерів у нашій системі vs. 1С |
| **Швидкість UX** — менеджер не чекає 1С на кожен клік | Час реакції UI: < 200 мс при типовій операції |
| **Менш ручної аналітики у Excel** для керівництва | Зникнення ad-hoc Excel-звітів про продажі і Best Manager |
| **Mobile-first** для зустрічей у полі | Доля операцій з мобільних пристроїв ≥ 60% для Meetings |
| **Покриття всіх рутинних потоків продажника**: візит → заказ → реалізація → дебіторка → рекламація | Зменшення необхідності для менеджера переключатись між > 1 системою |

## 1.3 Принципи (5 наскрізних)

1. **1С = source of truth, наш app = буфер + UI** (ADR-1)
2. **Менеджеру швидко, директору — повна аналітика**
3. **Mobile-first для всіх CRM-модулів**
4. **Безпека за замовчуванням** — RLS + JWT перед першим фінансово-чутливим блоком (ADR-4)
5. **Не переробляємо чуже на новий стек** — meeting-функціонал переписуємо; reclamations лишаються Python+Bitrix і інтегруються як microservice (ADR-5)

---

# 2. Поточний стан (baseline)

| Параметр | Значення |
|---|---|
| Стек | Next.js 16 + React 19 + TypeScript + Tailwind 4 + shadcn/ui |
| База даних | Supabase Postgres (Free tier — потребує upgrade до Pro перед Stage 1.5/2A, ADR-14) |
| Хостинг | Vercel (master auto-deploy, feature-branch preview-deploys) |
| 1С integration | 13 actions через `/api/onec` proxy + JWT cookie sessions |
| Тести | 240 кейсів (`tsx --test`) + arch-guard перед кожним пушем |
| Зробленого коду | ~57k LOC нетто, ~91 фактичних годин розробки (≈639–913 human-equivalent з AI-asisted multiplier) |
| Прод | Останній deploy після Миколаїв i18n fix (`7efc3b7`), tag baseline `etalon-glass-prod-2026-05-29` |
| Поточні модулі у проді | Планування / Мої клієнти (CRM-фундамент) / Огляд компанії |
| Open backlog (`docs/BACKLOG.md`) | ~33 пункти. TD-4 (RLS off) і TD-11/12/13 (god-components) **інтегровано у цей план** (ADR-3, ADR-4) |

---

# 3. Стратегічна карта — 6 етапів

| Етап | Назва | Скоуп | 1С нові actions | Зовнішні залежності | Frontend (днів) | Ризик |
|---|---|---|---|---|---|---|
| **0** | **Architecture + Design Prep** (поточний) | Docs + design exploration (дашборд+форма locked) + спека контрактів | 0 (тільки спека) | — | **3-5** | Low |
| **1** | **Meetings** | Перенос 8 ключових meeting-функцій + покращення (geo ADR-7, calendar worker, buffer ADR-2) | 0 (тримаємо існуючі 12 actions з meeting-4.0) | Google Calendar API | **15-20** | Medium |
| **1.5** | **Sales Detail Foundation + Best Manager** (parallel зі Stage 1) | Бекфіл line-item продажів 2025+; nightly+intra-day sync; **Best Manager** widget на Огляді компанії | **2 нових 1С actions** | — | **7-9** | Medium |
| **2A** | **Receivables (Debtors)** | Дебіторка з 1С: список, aging, widget на client card | **4 нових 1С actions** | Supabase Pro upgrade | **5-7** | Medium |
| **2B** | **Reclamations** | reclamation-app залишається Python+Bitrix; додаємо `/api/claims_by_client` + counter-widget + deep-link | 0 (зовнішня система) | Bitrix24 + TG bot + Python service | **3-4** | Low |
| **3** | **Orders / Realizations** | UI lift з meeting-app + повний backend з нуля. Multi-currency, gift logic, status workflow | **9-10 нових 1С actions** | — | **15-20** | High |

**Загальна оцінка frontend:** ~10-13 робочих тижнів (~2.5-3 місяці) без 1С-черги (1С розробка йде паралельно).
**Критична залежність:** черга 1С-розробника на нові actions для етапів 1.5, 2A, 3 — це може зрушити timeline вправо.

---

# 4. Технологічний стек і архітектура

## 4.1 Frontend

| Компонент | Технологія | Версія | Чому |
|---|---|---|---|
| Framework | Next.js | 16.2.2 | Існуючий стек, App Router + Server Components |
| UI library | React | 19 | Server/Client component split |
| Мова | TypeScript | 5.x | Type safety обов'язкова для домену з $ |
| Styling | Tailwind CSS | 4.x | Існуючий стек, glass-design system |
| Components | shadcn/ui | latest | Radix primitives + Tailwind |
| Data fetching | SWR | latest | Stale-while-revalidate з TTL (ADR-8) |
| State | Zustand | latest | Глобальний store для user session + UI state |
| Icons | lucide-react | latest | 0 емоджі policy (зі скіла design-taste-frontend) |
| Шрифти | Plus Jakarta Sans + JetBrains Mono | Google Fonts | Plus Jakarta для тіла, Mono для часу/чисел-clock-readout |
| Testing | tsx --test (Node native) | 22.x | Existing baseline 240 кейсів |
| Build | Next.js webpack | — | `next build --webpack` per vercel.json |

## 4.2 Backend / Data

| Компонент | Технологія | Чому |
|---|---|---|
| API | Next.js Route Handlers | Серверлес на Vercel |
| База даних | Supabase Postgres | Existing, потребує Pro upgrade |
| Storage (файли) | Supabase Storage або 1С URL | Залежить від Q3 doc preview implementation |
| Auth | Custom JWT cookies | sp_session HttpOnly, ECDSA |
| Crons | Vercel Cron | для buffer/sync workers |
| ERP integration | 1С HTTP-service через `/api/onec` proxy | Existing |
| External CRM (рекламації) | Bitrix24 REST API + Telegram Bot API | Через reclamation-app microservice |
| External Calendar | Google Calendar API | Через окремий sync worker з retry+DLQ |

## 4.3 Архітектура переходящих блоків (shared primitives)

Компоненти, що використовуються 2+ модулями. Виносимо у `src/components/crm-shared/` у момент **другого використання** (DRY-on-second-use).

| Компонент | Використовується у | Локація | Ключові props |
|---|---|---|---|
| `<ClientPicker>` | Meeting form, Order form, Reclamation widget | `crm-shared/client-picker.tsx` | `value, onChange, managerLogin, allowGlobalSearch?` |
| `<ClientCard>` (мінікартка + drill) | `/clients`, Meeting detail, Order detail | `crm-shared/client-card.tsx` | `clientId, variant: 'mini' \| 'full'` |
| `<AddressField>` (geo capture + manual + map preview, ADR-7) | Meeting form, Order delivery, Client edit | `crm-shared/address-field.tsx` | `value, onChange, mode: 'geo' \| 'manual', timeoutMs` |
| `<StatusBadge>` (sync + entity status, ADR-6) | Скрізь | `ui/status-badge.tsx` | `status, kind: 'sync' \| 'meeting' \| 'order'` |
| `<BrandPicker>` | `/clients`, Order form, Survey, Best Manager filter | `crm-shared/brand-picker.tsx` | `value, onChange, multi?` |
| `<PeriodFilter>` (вже існує) | Усі дашборди | `layout/period-filter.tsx` | — |
| `<SyncRetryToast>` (ADR-9) | Скрізь де є sync операції | `ui/sync-retry-toast.tsx` | `failedCount, onClick` |
| `<DocumentPreview>` (Q3) | Client card (documents tab) | `crm-shared/document-preview.tsx` | `clientId, documentId` |

## 4.4 Domain folders (нова структура)

Замість поточного звалища `src/components/dashboard/`:

```
src/
├── lib/
│   ├── meetings/         — types, hooks, API клієнт, sync logic
│   ├── clients/          — переїзд з clients-page.tsx (рефактор god-component, ADR-3)
│   ├── sales-detail/     — Stage 1.5 (sales line-items, Best Manager calc)
│   ├── orders/           — нова
│   ├── debtors/          — нова
│   ├── reclamations/     — тонкий клієнт reclamation-app API
│   └── crm-shared/       — buffer-pattern helpers, sync types, normalisation
├── components/
│   ├── meetings/         — Dashboard, Form, Detail, GeoCapture, Survey
│   ├── clients/          — рефактор з clients-page.tsx 1855 рядків
│   ├── sales-detail/     — BestManagerWidget, ClientSalesDrill, AnalyticsCharts
│   ├── orders/
│   ├── debtors/
│   ├── reclamations/
│   └── crm-shared/       — primitives
└── app/
    ├── meetings/         — page.tsx + nested routes
    ├── clients/          — існує + drill-down extensions
    ├── orders/           — нова
    ├── debtors/          — нова
    └── api/
        ├── cron/
        │   ├── sync-meetings/      — buffer worker (hourly)
        │   ├── sync-sales-detail/  — Stage 1.5 (nightly + hourly intra-day)
        │   ├── sync-calendar/      — Calendar worker з retry+DLQ
        │   └── refresh-debtors/    — Stage 2A cache invalidation
        └── ...existing routes
```

Поточні `dashboard/manager-dashboard.tsx`, `dashboard/rm-dashboard.tsx`, `dashboard/director-dashboard.tsx` лишаються у `dashboard/` як директорські view; не торкаємо без потреби.

## 4.5 Data flow (наскрізна архітектура)

```
                    ┌────────────────────────────────────┐
                    │                1С                   │
                    │     (source of truth — ADR-1)       │
                    │     HTTP service + Basic Auth        │
                    └──────┬───────────┬────────────────┬─┘
                           │           │                │
                  reads    │   writes  │   bulk-sync    │
                 (TTL)     │  (batch)  │  (cron)         │
                           ▼           ▲                ▼
            ┌──────────────────────────────────────────────────┐
            │     /api/onec proxy (Next.js Route Handlers)     │
            │  + 4 cron workers:                                │
            │    sync-meetings (hourly) — Stage 1                │
            │    sync-sales-detail (nightly+hourly) — Stage 1.5  │
            │    sync-calendar (per change) — Stage 1            │
            │    refresh-debtors (TTL invalidation) — Stage 2A   │
            └──────┬─────────────────────────────────────┬─────┘
                   │                                     │
            SWR    │                          batch       │
            cache  │                          upserts     │
                   ▼                                     ▼
        ┌──────────────────────┐         ┌────────────────────────┐
        │ Read endpoints       │         │ Write endpoints        │
        │ - meetings list      │         │ - meeting create/edit  │
        │ - debtors            │         │ - order save/post      │
        │ - sales detail       │         │   → *_syncs audit      │
        │ - clients            │         │     trail              │
        │ - reclamations       │         │                        │
        │   (proxy → Python)   │         │                        │
        └──────┬───────────────┘         └────────┬───────────────┘
               │                                  │
               │   Supabase Postgres (RLS — ADR-4)│
               │   meetings, sales_line_items,    │
               │   orders, debtors_cache,         │
               │   meeting_syncs, order_syncs,    │
               │   calendar_syncs                  │
               └──────────────┬───────────────────┘
                              │
                              ▼
                  ┌─────────────────────────┐
                  │  React UI (SWR + JWT)   │
                  │  Status badges (ADR-6)  │
                  │  Geo capture (ADR-7)    │
                  │  Best Manager widget    │
                  └─────────────────────────┘

Окремий контур (Stage 2B, без 1С):
React UI ──▶ /api/reclamations (proxy) ──▶ reclamation-app FastAPI ──▶ Bitrix24
                                                       │
                                                       └─▶ Telegram Bot API
```

## 4.6 Buffer pattern infrastructure (ADR-2)

**Tables:**

```sql
-- Шаблон для meetings (аналогічно orders). Sales detail НЕ використовує buffer
-- (бо це read-only history, ми не пишемо).
CREATE TABLE meetings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_login   text NOT NULL,
  client_id_1c    text NOT NULL,
  date            date NOT NULL,
  time            time NOT NULL,
  status          text NOT NULL,
  purpose         text,
  comment         text,
  planned_address text,
  start_address   text,
  start_lat       numeric(9,6),
  start_lon       numeric(9,6),
  end_address     text,
  end_lat         numeric(9,6),
  end_lon         numeric(9,6),
  geo_manual      boolean DEFAULT false,
  calendar_event_id text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE meeting_syncs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id       uuid REFERENCES meetings(id) ON DELETE CASCADE,
  status           text NOT NULL,  -- pending | syncing | synced | failed
  operation        text NOT NULL,  -- save | update | start | finish
  payload_snapshot jsonb,
  onec_response    jsonb,
  failure_reason   text,
  retry_count      int DEFAULT 0,
  next_retry_at    timestamptz,
  synced_at        timestamptz,
  created_at       timestamptz DEFAULT now()
);
```

**Sync worker (Vercel Cron):**

```typescript
// /api/cron/sync-meetings — runs hourly via vercel.json
export async function GET() {
  const pending = await fetchPendingSyncs('meeting_syncs', { limit: 50 });
  for (const sync of pending) {
    try {
      const r = await callOneC(sync.operation, sync.payload_snapshot);
      await markSynced(sync.id, r);
    } catch (err) {
      await markFailed(sync.id, err.message);  // ADR-9: failed не блокує наступні
    }
  }
}
```

---

# 5. Каталог архітектурних рішень (ADR-1..17)

Повні тексти з контекстом і наслідками — `docs/planning/decisions.md`. Тут — короткий реєстр.

| # | Рішення | Status |
|---|---|---|
| **ADR-1** | 1С — source of truth, наш app — буфер + UI | Accepted |
| **ADR-2** | Buffer pattern: instant write → cron batch у 1С з retry+DLQ | Accepted |
| **ADR-3** | Refactor god-components — паралельно з фічами (не окремий етап); цільова межа ≤500 рядків/файл | Accepted |
| **ADR-4** | Увімкнути RLS перед першим sensitive-блоком (Stage 1.5 фінансові дані) | Accepted |
| **ADR-5** | Meeting код переписуємо на наш стек, не мігруємо | Accepted |
| **ADR-6** | Sync-status — first-class UI-елемент (pending/syncing/synced/failed) | Accepted |
| **ADR-7** | Геолокація — read-only після захоплення, explicit toast на fail, manual fallback, конфігурований timeout | Accepted |
| **ADR-8** | TTL для кешу: дебіторка 10хв / клієнти 1год / замовлення каталог 6год / sales detail 1год (current month) | Accepted |
| **ADR-9** | Failed-sync рядки повертаємо у UI як «потребує правки» з причиною від 1С | Accepted |
| **ADR-10** | **Calendar sync** — повноцінно як у meeting-4.0, винесено у окремий worker з retry+DLQ (Q1) | Accepted |
| **ADR-11** | **Survey/Anketa** — спочатку lift as-is (a), versioned schema (b) пізніше за потреби (Q2) | Accepted |
| **ADR-12** | **Add Client files** — preview документів з 1С через новий action `getClientDocuments` (Q3) | Accepted |
| **ADR-13** | **Reclamations widget** — лічильник активних + клік відкриває reclamation-app у новій вкладці (Q5) | Accepted |
| **ADR-14** | **Supabase Pro upgrade** — обов'язково перед Stage 1.5/2A (PITR + 8 ГБ + DB резервування) (Q6) | Accepted |
| **ADR-15** | **Director Dashboard з meeting-app** — не переносимо (наш Огляд компанії покриває) (Q7) | Accepted |
| **ADR-16** | **Best Manager methodology** — 5 ТМ (Ellanse/PETARAN/ESSE/IUSE/Vitaran) з порогами участі + 2 обов'язкових фільтри + виключення спікерів + тайбрейкер за % виконання плану по ТМ | Accepted |
| **ADR-17** | **Sales Detail line-item format** — 11 базових полів від користувача + 1 додатково (segment_code) + стандартні numerics (qty/price/total/discount) | Accepted |

---

# 6. Аудити вихідних систем

## 6.1 metting-4.0 (прод — обов'язкове ПЗ менеджерів)

**Repo:** `github.com/EmetITteam/metting-4.0`
**Стек:** vanilla JS + Bootstrap 5 + Sentry + Google APIs · 2783 рядки у одному index.html, single-file SPA
**Висновок:** функціонал працює і покриває 8 ключових сценаріїв менеджера, але код-моноліт + 5 болів геолокації + plain-text сесія + fire-and-forget Calendar sync. **Переписуємо** (ADR-5).

### 12 функцій з meeting-4.0

| # | Функція | 1С action | Рішення на Stage 1 |
|---|---|---|---|
| 1 | Логін | `login` | Переписуємо на JWT cookie |
| 2 | Дашборд + фільтри | `getInitialData` | SWR + incremental update |
| 3 | Створення зустрічі | `saveNewMeeting` + Calendar | Buffer-write → batch (ADR-2) |
| 4 | Редагування | `updateMeeting` | + sync-status badge (ADR-6) |
| 5 | **Start meeting + геолокація** | `startMeeting` | Сильно покращуємо (ADR-7) |
| 6 | Finish meeting + end geo | `updateMeeting` | Те ж покращення (ADR-7) |
| 7 | Reschedule | `updateMeeting` | + conflict check |
| 8 | Survey/Anketa | `saveClientSurvey` | Lift as-is (ADR-11) |
| 9 | Client report | `getClientReport` | Об'єднуємо з нашим `/clients` drill-in (не дублюємо) |
| 10 | Clients page | `getManagerClients`, `findClient` | **Не переносимо** — наш `/clients` кращий |
| 11 | Add client (з file upload) | `registerNewClient` | + Q3 doc preview (ADR-12) |
| 12 | Date range filter | client-side | Через наш `PeriodFilter` |

### Болі (визначили ADRs)

| Біль | Що це | Як вирішуємо |
|---|---|---|
| God-monolith 2783 рядки | Один index.html усе | ADR-5 |
| Geolocation 10s timeout / тихий null save / без retry / без manual / приховані lat-lon | UX-біль у полі | ADR-7 |
| Aggressive refetch після save | Повільно | SWR + incremental |
| Survey JSON-blob без schema | Не можна еволюціонувати | ADR-11: lift as-is now, versioned later |
| Google Calendar fire-and-forget | Якщо 1С прошло а Calendar ні — silent loss | ADR-10: окремий worker з retry+DLQ |
| Session у localStorage plain | XSS-ризик | JWT cookie (ADR-4 base) |

## 6.2 meeting-app (WIP — твоя нова з заказами)

**Repo:** `github.com/EmetITteam/meeting-app`
**Стек:** той самий vanilla JS + Bootstrap (НЕ React)
**Стан:** WIP, не у проді

### Delta vs meeting-4.0

- Додано модулі: `orders.js`, `debtors.js`, `dashboard.js`
- Сторінки: `page-orders`, `page-order-detail`, `page-add-order`, `page-debtors`
- API token + CORS allowlist (хардненинг)
- PWA skeleton (manifest + sw)
- Analytics dashboard з role-based mock

### Orders block — деталі

- **UI ~85% готовий:** список, деталь, форма add/edit з cart, contract picker, delivery, payment, multi-currency UAH/USD
- **Backend 0%:** кнопки роблять `showToast()`, не зберігають
- **Жодного callApi для заказів — нема жодного 1С action**

### Що беремо у sales-planning

- UX patterns (карти заказів, фільтри, cart UI, contract picker)
- Data model (Order: `id, number, docType, posted, items[], delivery, payment, multi-currency`)
- Multi-currency логіка форми (з виправленням re-mark prices при зміні контракту)

**НЕ беремо:** JS-код, моки, PWA skeleton (відкладено), hardcoded CORS, Analytics dashboard (ADR-15)

## 6.3 reclamation-app (для Stage 2B)

**Repo:** `github.com/EmetITteam/reclamation-app`
**Стек:** **Python FastAPI** (відрізняється!) + static HTML · 568 рядків API + 1356 HTML
**Архітектура:** без власної БД — все живе у Bitrix24 SPA (Smart Process Automation)

### Інтеграції

- **Bitrix24:** webhook URL → CRUD на claims (SPA entity), timeline comments, IM notifications
- **Telegram bot:** `TG_BOT_TOKEN` + `TG_ADMIN_CHAT_ID` — notifications + reply через bot
- **1С:** 0 викликів — повністю окремий контур

### Підхід інтеграції (ADR-13)

- reclamation-app залишається окремим Python-сервісом
- Додаємо endpoint `GET /api/claims_count_by_manager/{login}` у reclamation-app
- У sales-planning робимо widget-лічильник на client card → клік → deep-link у reclamation-app
- ~3-4 дні роботи, низький ризик

---

# 7. Етап 0 — Architecture + Design Prep

**Status:** ✅ Частково готово, очікує фіналізації цього документа

## 7.1 Deliverables (поточний стан)

| Артефакт | Стан | Файл |
|---|---|---|
| Аудити 3 репо | ✅ Done | `findings.md` |
| 17 ADR | ✅ Done | `decisions.md` |
| Цей PROJECT_PLAN.md v2 | ✅ Done | `docs/PROJECT_PLAN.md` |
| EXECUTIVE_SUMMARY.md для керівництва | ⏳ Поточний крок | `docs/EXECUTIVE_SUMMARY.md` |
| Design dashboard (locked v3) | ✅ Done | `public/design-meetings-dashboard-v3.html` |
| Design form (locked Variant A) | ✅ Done | `public/design-meetings-form.html` |
| `1C_NEW_ACTIONS_SPEC.md` для 1С розробника | ⏭ Pending | створимо одразу після затвердження цього плану |

## 7.2 Що залишилось у Stage 0

1. Створити `docs/EXECUTIVE_SUMMARY.md` (цей же turn)
2. Узгодження плану з керівництвом + затвердження
3. Створити `docs/1C_NEW_ACTIONS_SPEC.md` — повна спека для 1С на 17 нових actions
4. Передати спеку 1С-розробнику, узгодити пріоритетність черги

---

# 8. Етап 1 — Зустрічі (Meetings)

## 8.1 Scope (фінальний)

| Пріоритет | Функції |
|---|---|
| 🔥 **Core** (Sprints 1.1-1.6) | Логін (наш JWT) · Дашборд + дата-фільтр + клієнт-фільтр + widgets · Створення/редагування · Start/Finish + геолокація · Buffer sync worker · Calendar sync worker |
| 🟡 **Supporting** (Sprints 1.7-1.8) | Reschedule + conflict check · Survey/Anketa lift as-is · PeriodFilter integration |
| ⏭ **Не у скоупі meeting-модуля** | Client report (вже у `/clients` drill-in) · Clients page (вже `/clients`) · Add Client form (Stage 1.x — окремий sprint) · API token + CORS (окремий хардненинг проекту) |

**Архітектурні роботи всередині Stage 1 (приховані, обов'язкові):**

- Supabase schema для `meetings` + `meeting_syncs` + RLS shadow-mode (ADR-4)
- Buffer pattern infrastructure (ADR-2): instant-write → погодинний cron-batch у 1С з retry+DLQ
- Geolocation handler за ADR-7
- Calendar sync worker (ADR-10) винесений з 1С-proxy
- God-component refactor `/clients` і `planning-form` по мірі дотику (ADR-3)

## 8.2 Sprint decomposition

| # | Спринт | Скоуп | Файли (ключові) | Час | Залежності |
|---|---|---|---|---|---|
| 1.1 | Schema + Auth bridge + RLS | Migrations: `meetings`, `meeting_syncs`, RLS policies, JWT login claim. Тести RLS. Backup перед увімкненням | `supabase/migrations/`, `src/lib/session.ts` | 2 д | — |
| 1.2 | Dashboard skeleton + фільтри | `/meetings` route, list з status badges, PeriodFilter integration, ClientPicker primitive, widgets (Today/Done/Overdue/NeedsFix) | `src/components/meetings/*` | 3 д | 1.1 |
| 1.3 | Create + Edit meeting form | Variant A (Bottom-sheet/Modal) per locked design. ClientPicker + AddressField + Date/Time + Purpose + Comment. Buffer-write у Postgres | `src/components/meetings/meeting-form.tsx` | 3 д | 1.2 + design |
| 1.4 | Geolocation (start/finish) — ADR-7 | GeoCapture component з retry, manual fallback, configurable timeout. lat/lon видимі (не приховані як у v1) | `src/components/meetings/geo-capture.tsx` | 2 д | 1.3 |
| 1.5 | Buffer sync worker + retry/DLQ | `/api/cron/sync-meetings`, Vercel Cron schedule, per-record retry. UI індикатор `pending`/`failed` через ADR-9 | `src/app/api/cron/sync-meetings/route.ts`, `vercel.json` | 2 д | 1.3, 1.4 |
| 1.6 | Calendar sync worker (ADR-10) | Винесено з 1С-proxy: `/api/cron/sync-calendar` з queue або черга у `calendar_syncs` table. Retry exponential backoff | `src/app/api/cron/sync-calendar/route.ts`, `src/lib/google-calendar.ts` | 2 д | 1.3 |
| 1.7 | Reschedule + conflict check | Edit form + перевірка clash з іншою активною зустріччю менеджера | `src/components/meetings/reschedule-modal.tsx` | 1 д | 1.5 |
| 1.8 | Survey/Anketa lift as-is | Survey form за meeting-4.0 структурою. JSON-blob у 1С зберігаємо як зараз для legacy compatibility (ADR-11) | `src/components/meetings/survey-form.tsx` | 2 д | 1.5 |
| 1.9 | God-component refactor on-touch (ADR-3) | По мірі торкання `/clients` для ClientPicker і ClientCard primitives — виносимо у crm-shared | `src/components/clients/*`, `src/components/crm-shared/*` | 1-2 д | continuous |
| 1.10 | Mobile QA + polish + deploy | Playwright прогон на iPhone-широті, перевірка геолокації (mock + denied + timeout), buffer-status флоу. Merge у master. Etalon-tag `etalon-meetings-prod-YYYY-MM-DD` | `scripts/qa-mobile.mjs` | 1 д | 1.5-1.9 |

**Total Stage 1:** ~18-20 робочих днів.

## 8.3 1С dependencies

**Існуючі actions (тримаємо, не змінюємо контракт):**
- `login`, `getInitialData`, `saveNewMeeting`, `updateMeeting`, `startMeeting`
- `findClient`, `getManagerClients`, `getClientReport`, `saveClientSurvey`, `getAllMeetingsForClient`
- `updateMeetingCalendarId` (proxy-only)

**Жодних нових actions для Stage 1.** Дія з боку 1С-розробника: тільки гарантія що контракт payload/response не зміниться.

## 8.4 Risks (Stage 1)

| Ризик | Imовірність | Вплив | Mitigation |
|---|---|---|---|
| Buffer-worker race conditions (concurrent edit + sync) | M | H | Per-record advisory locks + state machine. Тестуємо у Sprint 1.5 |
| Calendar sync regressions (менеджери звикли) | H | M | Worker з retry+DLQ + canary на 1-2 менеджерах. Швидкий rollback |
| RLS зламає існуючі ендпоінти | M | H | Shadow-mode (RLS у permissive) → enforce після smoke-тесту |
| Геолокація у проблемних зонах (підвал, поганий сигнал) | H | M | Manual fallback (ADR-7), timeout конфігурований env |
| God-component refactor зачепить більше ніж очікувалось | M | M | Boundary-first (primitives), потім решта |

---

# 9. Етап 1.5 — Sales Detail Data Foundation

**Status:** Format locked 2026-06-02 — готовий до 1С-спеки
**Position:** іде паралельно з Stage 1 (різні люди / різні файли)
**Primary consumer:** Best Manager analytics widget (Section 10)

## 9.1 Призначення

Завантажити **рядкову деталізацію продажів** з 1С у наш Postgres для:

1. **«Кращий менеджер по ТМ»** — автоматичний розрахунок переможців конкурсу (Section 10)
2. **Майбутньої аналітики** — тренди, top-products, кореляції
3. **On-demand експорту звітів** менеджерам
4. **Drill-down на client card** — що клієнт купував детально

## 9.2 Стратегія даних

### Бекфіл (one-time)

Завантажуємо з **2025-01-01** до сьогодні через batch action 1С, шматками по місяцях.

### Інкремент (ongoing)

| Що | Як часто | Чому |
|---|---|---|
| Поточний + попередній місяць — повне перезавантаження | Щоночі o 03:00 (Vercel Cron) | У 1С можуть бути правки минулого місяця |
| Поточний день — інкремент | Раз на годину протягом дня | Для динаміки Best Manager |
| Все що старше попереднього місяця | Не чіпаємо | Immutable history |

### Idempotent re-sync

Унікальний індекс `(doc_number_1c, product_name, qty, total_usd)` запобігає дублям. При повному перезавантаженні current+prev місяця — DELETE з границею `doc_date >= first_of_prev_month` + INSERT у транзакції.

## 9.3 Формат line-item (LOCKED від користувача)

| 1С атрибут | SQL column | Тип |
|---|---|---|
| Документ продажі | `doc_number_1c` | text |
| ДокументПродажі.Дата | `doc_date` | date |
| Контрагент | `client_name` | text |
| Контрагент.Код | `client_id_1c` | text |
| Телефон контрагента | `client_phone` | text |
| Номенклатура | `product_name` | text |
| Повод скидки | `discount_reason` | text |
| ДокументПродажі.Семінар | `doc_seminar` | text |
| Документ продажі.Проект | `doc_project` | text |
| Контрагент.Сотрудник | `manager_1c` | text |
| Підрозділ | `division` | text |
| **+ segment_code** (нове, потрібне для Best Manager) | `segment_code` | text |
| + qty | `qty` | numeric |
| + price_usd | `price_usd` | numeric |
| + discount_pct, discount_usd | `discount_pct`, `discount_usd` | numeric |
| + total_usd | `total_usd` | numeric |

## 9.4 Схема Postgres

```sql
CREATE TABLE sales_line_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- з 1С
  doc_number_1c   text NOT NULL,
  doc_date        date NOT NULL,
  client_id_1c    text NOT NULL,
  client_name     text NOT NULL,
  client_phone    text,
  product_name    text NOT NULL,
  segment_code    text,                -- ELLANSE/PETARAN/ESSE/IUSE/VITARAN/...
  discount_reason text,
  discount_pct    numeric(5,2),
  discount_usd    numeric(12,2),
  qty             numeric(12,3) NOT NULL,
  price_usd       numeric(12,2),
  total_usd       numeric(15,2) NOT NULL,
  doc_seminar     text,                -- виключаємо з Best Manager якщо not null
  doc_project     text,
  manager_1c      text NOT NULL,
  division        text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  source_period   text NOT NULL        -- 'backfill' | 'YYYY-MM'
);

CREATE UNIQUE INDEX idx_sales_uniq ON sales_line_items
  (doc_number_1c, product_name, qty, total_usd);

CREATE INDEX idx_sales_client_date    ON sales_line_items (client_id_1c, doc_date DESC);
CREATE INDEX idx_sales_manager_date   ON sales_line_items (manager_1c, doc_date DESC);
CREATE INDEX idx_sales_segment_date   ON sales_line_items (segment_code, doc_date DESC);
CREATE INDEX idx_sales_brand_manager  ON sales_line_items (segment_code, manager_1c, doc_date DESC)
  WHERE doc_seminar IS NULL OR doc_seminar = '';  -- для Best Manager queries
CREATE INDEX idx_sales_date_brin      ON sales_line_items USING BRIN (doc_date);

-- RLS
ALTER TABLE sales_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_select ON sales_line_items
  FOR SELECT USING (
    manager_1c = current_setting('app.login', true)
    OR current_setting('app.role', true) IN ('director', 'admin')
  );
```

## 9.5 1С actions (нові)

| Action | Призначення |
|---|---|
| `getDetailedSalesBatch(fromDate, toDate, managerLogin?)` | Backfill + nightly sync |
| `getDetailedSalesByClient(clientId, fromDate, toDate)` | Drill-down на client card, TTL 10хв (ADR-8) |

## 9.6 Sprint decomposition

| # | Спринт | Час |
|---|---|---|
| 1.5.1 | Спека для 1С (формат + edge cases) | 0.5 д |
| 1.5.2 | 1С реалізує обидва actions | TBD (1С queue) |
| 1.5.3 | Migration + RLS shadow-mode | 1 д |
| 1.5.4 | Cron worker (nightly + intra-day) | 2 д |
| 1.5.5 | Backfill script (2025-01-01 → today по місяцях з progress) | 1 д |
| **1.5.6** | **Best Manager widget** (UI + algo) | **2-3 д** |
| 1.5.7 | Drill-down endpoint `/api/sales-detail/by-client/[id]` | 1 д |

**Total frontend:** ~7-9 днів. Залежність: готовність 1С actions.

## 9.7 Об'єм даних і Storage

| Період | Рядків (приблизно) | Розмір (≈400 байт/рядок) |
|---|---|---|
| Backfill 2025 | 240k | ~95 МБ |
| До 2027 | 480k | ~190 МБ |
| До 2028 (3 роки) | 720k | ~290 МБ |

Supabase Pro upgrade (8 ГБ) дає роки запасу + PITR (ADR-14).

## 9.8 Open items (Stage 1.5)

- ⏳ **`segment_code` від 1С** — без поля Best Manager не працює; уточнити з 1С-розробником при спеці
- ⏳ **`manager_1c` ↔ login mapping** — з'ясувати чи 1С повертає email (можна join з `users.login`) або ПІБ (потрібен окремий мапінг)
- ⏳ **IUSE sub-brand aggregation** — 1С повертає `IUSE` як один сегмент чи окремо `IUSE Collagen`/`IUSE hair`/`IUSE SB`? Якщо окремо, наш агрегатор сумує

---

# 10. Best Manager Analytics

(Деталі — `docs/planning/best-manager-spec.md`)

## 10.1 Контест-категорії (за PDF червень 2026)

| # | Бренд | Метрика перемоги | Поріг участі |
|---|---|---|---|
| 1 | **Ellanse** | макс кількість упаковок | ≥ 20 упаковок |
| 2 | **PETARAN** | макс кількість одиниць | ≥ 30 упаковок |
| 3 | **ESSE** | макс сума USD | ≥ $4,000 |
| 4 | **IUSE** (Collagen + hair + SB) | макс сума USD | ≥ $6,000 |
| 5 | **Vitaran** | макс сума USD | ≥ $10,000 |

## 10.2 Універсальні фільтри

1. Індивідуальний план менеджера ≥ 100%
2. План по ТМ ≥ 100%
3. **Закупівлі спікерів виключаються** (`doc_seminar IS NULL OR ''`)

## 10.3 Тайбрейкер

Найвищий % виконання плану по ТМ. Приклад з PDF: 102% / 120% / 140% → переможець 140%.

## 10.4 UI

Огляд компанії + Дашборд директора — секція «🏆 Найкращі менеджери»:
- 5 карток (по одній на бренд) — переможець + ключові цифри
- Період: поточний місяць за замовчуванням; селектор тиждень/місяць/квартал
- Drill-down: всі eligible-менеджери ранжовані

## 10.5 Open items

- Період comparison default (місяць чи квартал)
- Archive winners історія (поки не зберігаємо, обчислюємо щоразу)
- Notification переможцям (NTH у майбутньому)

---

# 11. Етап 2A — Дебіторка (Receivables)

## 11.1 Scope

- Список дебіторів менеджера з aging (30/60/90/90+ днів)
- Деталь по клієнту: розрахункові документи, суми, дати
- Widget на client card: «Заборгованість X, протермінована Y»
- Опційно аналітика для директора (після core)

## 11.2 Schema (cache only)

```sql
CREATE TABLE debtors_cache (
  client_id_1c   text NOT NULL,
  manager_login  text NOT NULL,
  total_amount   numeric(15,2),
  overdue_amount numeric(15,2),
  aging_30       numeric(15,2),
  aging_60       numeric(15,2),
  aging_90       numeric(15,2),
  aging_90_plus  numeric(15,2),
  documents      jsonb,
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id_1c, manager_login)
);
-- TTL 10 хв (ADR-8). Інвалідація — по часу або manual refresh кнопкою.
```

## 11.3 1С actions (нові)

| Action | Призначення |
|---|---|
| `getDebtorsByManager` | Список усіх дебіторів менеджера з aging |
| `getDebtorByClient` | Деталь по клієнту: документи, проводки |
| `getReceivablesAging` | Aging summary (по менеджеру / регіону / компанії) |
| `getPaymentHistory` | Історія платежів клієнта (опційно для core) |

## 11.4 Sprint decomposition

| # | Спринт | Час |
|---|---|---|
| 2A.1 | Migration + cache strategy + invalidation | 1 д |
| 2A.2 | API integration з 1С (після готовності actions) | 2 д |
| 2A.3 | UI: widget на client card + standalone `/debtors` view + drill-down | 2-3 д |
| 2A.4 | Mobile QA + deploy | 1 д |

**Total Stage 2A:** 6-7 днів frontend.

---

# 12. Етап 2B — Рекламації (Reclamations)

## 12.1 Scope

Підхід: **Option D** — reclamation-app залишається окремим Python-сервісом, інтегрується через REST API.

- Widget на client card: лічильник активних рекламацій
- Клік → відкриває reclamation-app у новій вкладці (deep-link) — ADR-13

## 12.2 Sprint decomposition

| # | Спринт | Сторона | Час |
|---|---|---|---|
| 2B.1 | Додати endpoint `GET /api/claims_count_by_manager/{login}` у reclamation-app | Python (я → reclamation-app repo) | 1-2 д |
| 2B.2 | Widget на client card + deep-link у sales-planning | Next.js | 1 д |
| 2B.3 | Mobile QA + deploy | — | 0.5 д |

**Total Stage 2B:** 3-4 дні.

## 12.3 Open item

- Bitrix webhook URL — захардкоджено у reclamation-app; перенесемо у env при Sprint 2B.1 (security ADR-4 spirit)

---

# 13. Етап 3 — Замовлення / Реалізації (Orders)

## 13.1 Scope

UI lift з `meeting-app` (`orders.js` + сторінки) на наш стек + backend з нуля. Multi-currency UAH/USD, cart, contract picker, delivery types, payment types, gift logic.

## 13.2 Schema

```sql
CREATE TABLE orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number_1c     text,
  doc_type      text NOT NULL,      -- order | realization
  posted        boolean DEFAULT false,
  manager_login text NOT NULL,
  client_id_1c  text NOT NULL,
  contract_name text,
  contract_currency text,           -- UAH | USD
  total_amount_usd numeric(15,2),
  delivery_type text,
  delivery_address text,
  payment_type  text,
  comment       text,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE order_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid REFERENCES orders(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  qty         numeric(10,3) NOT NULL,
  price_usd   numeric(12,2) NOT NULL,
  is_gift     boolean DEFAULT false
);

CREATE TABLE order_syncs (...);  -- аналогічно meeting_syncs
```

## 13.3 1С actions (нові)

| Action | Призначення |
|---|---|
| `getCatalog` | Каталог продуктів (з restriction-прапорцями) |
| `getOrderClients` | Клієнти доступні для заказів (з контрактами) |
| `getContracts` | Контракти конкретного клієнта (з currency) |
| `saveOrder` | Зберегти чернетку заказу |
| `postOrder` | Перевести у formed (provedeno у 1С) |
| `createRealization` | Створити реалізацію на основі заказу |
| `getAvailableGifts` | Подарунки доступні для додавання |
| `validateOrder` | Перевірка валідності перед provedeniem |
| `getOrderHistory` | Історія заказів клієнта/менеджера |

## 13.4 Sprint decomposition

| # | Спринт | Скоуп | Час |
|---|---|---|---|
| 3.1 | Schema migration + RLS + Order list skeleton | 2 д |
| 3.2 | Catalog + ClientPicker context для замовлення | 2 д |
| 3.3 | Add Order form (cart, contract, delivery, payment) — **design exploration спочатку** | 3-4 д |
| 3.4 | Multi-currency logic з re-mark prices при зміні контракту | 1 д |
| 3.5 | Gift logic (UI вибору, restriction check, backend tracking) | 2-3 д |
| 3.6 | Order detail + status changes (draft → formed → realization) | 2 д |
| 3.7 | Buffer-sync worker для orders (re-use Stage 1 pattern) | 1 д |
| 3.8 | Mobile QA + deploy | 1 д |

**Total Stage 3:** ~14-18 днів frontend.

---

# 14. Cross-cutting concerns

## 14.1 Безпека

- **RLS** (ADR-4): спочатку для нових таблиць (`meetings`, `sales_line_items`, `debtors_cache`, `orders`), потім ретроспективно для існуючих (`forecasts`, `gap_closures`, `users`). Shadow-mode → enforce.
- **JWT-cookie** (вже існує): додаємо `login` + `role` claims як `current_setting('app.login')` / `current_setting('app.role')` для RLS-політик
- **IDOR closure** на `getClientReport`/`getAllMeetingsForClient`: при кожному виклику перевіряти що `clientId` належить менеджеру (через `getManagerClients` cache)
- **Secret rotation:** Bitrix webhook URL → env (Sprint 2B.1), TG bot token → env, 1С credentials → ротація раз/квартал

## 14.2 Геолокація (ADR-7)

Реалізація у `src/components/crm-shared/address-field.tsx`:

```typescript
<AddressField
  mode="geo"                                  // 'geo' | 'manual'
  timeoutMs={GEO_TIMEOUT_MS}                  // env, default 15000
  onCapture={({lat, lon, address}) => ...}
  onFail={({reason}) => showToast({reason, retry: () => ...})}
  onManualEntry={(address) => setGeoManual(true, address)}
/>
```

## 14.3 Calendar sync worker (ADR-10)

Окремо від основного buffer worker:

- Своя таблиця `calendar_syncs` з payload (meeting snapshot, operation: insert/update/delete)
- Cron щохвилини
- Retry exponential backoff (1m → 5m → 15m → 1h → fail)
- DLQ rows: окремий UI у адмінці «помилки Calendar», ручний resync

## 14.4 God-component refactor (ADR-3)

Не окремий етап. По мірі торкання:

- `clients-page.tsx` (1855) — розбиваємо при роботі над ClientPicker/ClientCard primitives у Stage 1
- `planning-form.tsx` (2272) — не плануємо торкати без потреби
- `company-overview-dashboard.tsx` (1176) — стабільний, не чіпаємо

Boundary: новий код у нових файлах ≤500 рядків. Старий — рефакторимо коли торкаємось.

## 14.5 Testing strategy

- Поточний baseline: 240 кейсів `tsx --test` + arch-guard. Зберігаємо.
- Нові таблиці → нові unit-тести бізнес-логіки (наприклад, retry state machine для sync-worker, Best Manager algorithm)
- RLS → integration-тести з шаблоном «менеджер A не бачить дані менеджера B»
- Playwright QA → mobile scenario для геолокації (mock + permission denied + timeout)
- Pre-push hook: `tsx --test && tsc --noEmit && check:arch` лишається

## 14.6 Backup + RLS migration plan

Перед увімкненням RLS (Stage 1.1):

1. Backup всіх таблиць через `scripts/backup-supabase.mjs`
2. Створити RLS-політики у shadow-mode (`PERMISSIVE` без enforce)
3. Прогнати тестовий набір користувачів
4. Активувати enforce
5. Smoke-тест у прод

## 14.7 Performance considerations

- Sales detail таблиця → 240k+ рядків. **BRIN-індекс** по `doc_date` + B-tree composite по `(segment_code, manager_1c, doc_date)` partial WHERE `doc_seminar IS NULL`. Best Manager query має fitз ~50 мс
- Cron-batch розмір: 50 рядків за раз для buffer sync, 5000 рядків для bulk sales detail (узгодити з 1С dev)
- SWR cache TTLs (ADR-8) — мінімізують 1С навантаження

## 14.8 Observability

- Поточно: console.error → Vercel logs. Базово.
- **NTH:** Sentry для error tracking + session replay ($26/міс) — додаємо паралельно з Stage 1 для відстеження buffer/sync помилок
- DLQ для failed syncs — окремий UI у admin section

---

# 15. Risk Register (top 15)

| # | Ризик | Етап | Probability | Impact | Mitigation |
|---|---|---|---|---|---|
| 1 | 1С-черга на нові actions затримає Stage 1.5 / 2A / 3 | 1.5, 2A, 3 | H | H | Спека готується одразу; 1С dev стартує паралельно зі Stage 1 |
| 2 | Buffer-worker race conditions при concurrent edit + sync | 1 | M | H | Per-record advisory locks, тестуємо у Sprint 1.5 |
| 3 | Google Calendar API rate-limits на бульшому об'ємі | 1 | M | M | Worker з batch + backoff (ADR-10) |
| 4 | RLS-міграція зламає існуючі ендпоінти | 1, 1.5 | M | H | Shadow-mode → enforce, тести на pre-merge |
| 5 | Геолокація у проблемних зонах (підвал, поганий сигнал) | 1 | H | M | Manual fallback (ADR-7), timeout конфігурований env |
| 6 | God-component refactor зачепить більше ніж очікувалось | 1, 3 | M | M | Boundary-first refactor (primitives) |
| 7 | Bitrix webhook URL hardcoded — проблема при rotation | 2B | M | M | Перенесемо у env у Sprint 2B.1 |
| 8 | Supabase Free лімити на CRM-обсязі | 1.5+, 2A | H | H | **Pro upgrade перед Stage 1.5** (ADR-14) |
| 9 | Multi-currency UAH/USD edge cases у заказах | 3 | M | M | Тести re-mark logic; review від користувача перед prod |
| 10 | Менеджери чинять опір новому UI зустрічей | 1 | L | M | Зберігаємо існуючі workflow + текст; rollout через canary 1-2 менеджерів |
| 11 | **1С не повертає `segment_code` у line-item** | 1.5 | M | H | Critical для Best Manager. Узгодити при спеці; якщо не дадуть — робимо product→brand мапінг у нашому коді через `BRAND_NAMES` + product_name pattern matching |
| 12 | **1С не повертає `doc_seminar` коректно** | 1.5 | M | H | Critical для Best Manager (виключення спікерів). Якщо не дадуть — Best Manager рахуватиме з пожуком, треба маркувати лекторів окремо |
| 13 | **`manager_1c` неоднорідний (то email, то ПІБ)** | 1.5 | M | M | Нормалізаційний шар у адаптері; fallback на match-by-similarity |
| 14 | Sales detail backfill 1С перевантажить | 1.5 | M | M | Chunked-batch по місяцях, exponential backoff між chunks |
| 15 | Документи з 1С (Q3) — preview format не визначено | 1 (Add Client) | L | M | Узгодити при спеці getClientDocuments: URL/PDF/image, content-type |

---

# 16. Timeline і ресурси

## 16.1 Гантт укрупнено

```
Тиждень    1   2   3   4   5   6   7   8   9   10  11  12  13
ЕТАП 0   ▓▓▓
ЕТАП 1     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
ЕТАП 1.5      ▓▓▓▓▓▓▓▓▓▓▓▓▓
ЕТАП 2A                          ▓▓▓▓▓▓
ЕТАП 2B                              ▓▓▓
ЕТАП 3                                  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓
1С queue   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
                ↑ spec ready    ↑ sales actions   ↑ orders actions
```

**Приблизний час:** 10-13 робочих тижнів (~2.5-3 місяці) frontend. 1С-черга йде паралельно. Етапи можуть зрушитися залежно від готовності 1С-actions.

## 16.2 Ресурси

| Роль | Хто | Зайнятість |
|---|---|---|
| Frontend / арх | Команда фронтенду | Full-time через всі етапи |
| Product Owner / Business | IT Director (заказчик) | Точкові рішення + review |
| 1С розробка | 1С розробник EMET | ~50% часу через черги по етапах |
| Bitrix24 admin | Існуючий адмін | Точкові (Stage 2B) |
| QA | (рекомендую виділити) | Stage 1.10, 2A.4, 2B.3, 3.8 |

---

# 17. Зовнішні залежності

| Залежність | Що треба | Коли | Стан |
|---|---|---|---|
| 1С-розробник | Спека → реалізація 17 нових actions | Спека після затвердження плану; реалізація — паралельно зі Stage 1 | Pending |
| Supabase Pro | Upgrade до $25/міс для PITR + 8 ГБ | **Перед Stage 1.5** (узгоджено, ADR-14) | Pending |
| Vercel Cron | Cron jobs (потрібен Vercel Hobby+ дозволяє 2 cron, Pro дає більше) | До Stage 1.5 (4 worker) | Перевірити поточний tier |
| Bitrix24 admin | Доступ до webhook URL ротації + SPA schema | Stage 2B | Pending |
| Google Calendar | API quota перевірка при більшому об'ємі | Stage 1.6 | OK для поточного |
| Sentry (опц) | Error tracking $26/міс | Паралельно зі Stage 1 (highly recommended) | Pending decision |
| Playwright у CI | Поки manual, можна додати у CI | NTH-3 backlog | Pending |

---

# 18. Витрати (cost implications)

| Сервіс | Поточно | Після CRM-розширення | Зміна |
|---|---|---|---|
| Supabase | Free $0 | **Pro $25/міс** | +$25/міс |
| Vercel | Hobby $0 | Hobby $0 (якщо вкладемось у 2 cron) або Pro $20/міс (4 cron + Speed Insights) | $0-$20/міс |
| Sentry (опц) | — | $26/міс | +$26/міс |
| GitHub | Free | Free | $0 |
| Google Calendar API | Free | Free (типовий obem менш 10k запитів/день) | $0 |
| Bitrix24 (існуючий) | Existing | Existing | $0 |
| Telegram Bot API | Free | Free | $0 |

**Сумарно нові щомісячні витрати:** **$25-$71/міс** ($300-$852/рік).

**Ймовірний сценарій (мінімум):** Supabase Pro + Sentry = $51/міс. Plus Vercel Pro якщо знадобиться більше cron — $71/міс.

---

# 19. Закриті рішення (Q1-Q7) і відкриті питання

## 19.1 Закриті (рішення прийняті 2026-06-02)

| Q | Питання | Рішення |
|---|---|---|
| Q1 | Calendar sync depth | ✅ Повноцінно як у meeting-4.0, винесено у окремий worker з retry+DLQ (ADR-10) |
| Q2 | Survey schema | ✅ Спочатку lift as-is (a); versioned schema (b) пізніше за потреби (ADR-11) |
| Q3 | Add Client files | ✅ Preview документів з 1С через новий action `getClientDocuments` (ADR-12) |
| Q5 | Reclamations widget | ✅ Лічильник активних + клік → deep-link у reclamation-app (ADR-13) |
| Q6 | Supabase Pro upgrade | ✅ Upgrade перед Stage 1.5 (ADR-14) |
| Q7 | Director Dashboard з meeting-app | ✅ Не переносимо (наш Огляд компанії покриває) (ADR-15) |

## 19.2 Відкриті items (тригерять-блокують 1С-спеку)

| # | Item | Власник рішення | Коли вирішується |
|---|---|---|---|
| O1 | `segment_code` від 1С у line-item — як називається сегмент в 1С? | 1С dev | На спекі (Stage 0 → 1.5.1) |
| O2 | `doc_seminar` — як відрізнити seminar/спікер закупки? | 1С dev | На спекі (Stage 1.5.1) |
| O3 | `manager_1c` — email чи ПІБ чи кодний номер? | 1С dev | На спекі (Stage 1.5.1) |
| O4 | IUSE під-бренди — як 1С повертає (один segment_code чи окремі)? | 1С dev | На спекі (Stage 1.5.1) |
| O5 | `getClientDocuments` (Q3) — як 1С повертає документи (URL? PDF stream? metadata only?) | 1С dev | На спекі (Stage 1.x Add Client) |
| O6 | Best Manager період comparison default — місяць чи квартал? | Заказчик | До Stage 1.5.6 |
| O7 | Best Manager — зберігати «архів переможців» в історії? | Заказчик | Не зараз; ревью після прода |

## 19.3 Backlog (NTH — не блокує план)

- Sentry $26/міс — рекомендую але не блокує
- Playwright у CI — NTH-3
- Push notifications для менеджерів-переможців Best Manager — NTH
- Аналітика «top-products по клієнту» — NTH (на основі Stage 1.5 даних)

---

# 20. Глосарій

| Термін | Значення |
|---|---|
| **ADR** | Architecture Decision Record — запис про прийняте архітектурне рішення з контекстом і наслідками |
| **Buffer pattern** | Підхід: instant write у нашу БД → батч у джерело правди (1С) з retry+DLQ |
| **DLQ** | Dead Letter Queue — рядки що не вдалося синхронізувати після всіх ретраїв |
| **God-component** | React-компонент >1000 рядків, що тримає багато непов'язаної логіки |
| **IDOR** | Insecure Direct Object Reference — вразливість коли можна звертатись до чужих даних за ID |
| **RLS** | Row-Level Security (Postgres) — політики per-row хто що бачить |
| **SPA (у Bitrix)** | Smart Process Automation — custom entity у Bitrix24 з полями і workflow |
| **TTL** | Time-To-Live — як довго закешовані дані вважаються свіжими |
| **Спікер** | Лектор-партнер EMET; його продажі/закупки виключаються з конкурсу Best Manager |
| **Сегмент / ТМ** | Торгова марка (бренд): Ellanse, PETARAN, ESSE, IUSE, Vitaran, тощо |
| **Реалізація** | У 1С — документ-проведення продажу (vs. order — чернетка/заказ) |
| **PITR** | Point-in-time recovery — можливість відкатити БД до конкретної точки часу |

---

_Документ оновлюється при будь-якому значному рішенні. Версіонування — додавати «v3 (date)» при суттєвому перегляді. Поточна версія v2 (2026-06-02)._
