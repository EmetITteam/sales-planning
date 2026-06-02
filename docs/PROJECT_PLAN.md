# Sales-Planning → EMET CRM
## План доробки проекту

**Версія:** v1 (draft) · **Дата:** 2026-06-02 · **Етап:** 0 (Архітектура + Дизайн)
**Автор плану:** IT Director EMET (заказчик) + Claude (фронтенд-розробка)
**Аудиторія:** заказчик, 1С-розробники, фронтенд. Виконавча версія для керівництва — окремий документ після узгодження плану.

**Supporting docs:**
- `docs/planning/decisions.md` — реєстр ADR (всі архітектурні рішення з контекстом)
- `docs/planning/findings.md` — аудити meeting-4.0, meeting-app, reclamation-app
- `docs/planning/progress.md` — поточний sprint-tracker
- `docs/1C_NEW_ACTIONS_SPEC.md` — _буде створено після узгодження логіки фіч_

---

## 1. Vision

Sales-planning перетворюється на повноцінну CRM EMET для відділу продажу. Зараз — 3 модулі у проді (Планування, Мої клієнти, Огляд компанії). Після розширення — повний робочий інструмент менеджера: **зустрічі, заказы, дебіторка, рекламації** — все в одному UI, винесене з 1С.

**Ключові принципи:**

- **1С = source of truth, наш app = буфер + UI.** Менеджер не чекає 1С на кожен клік.
- **Менеджеру швидко, директору повна аналітика.** CRM для менеджерів, дашборди для керівників.
- **Mobile-first для всього CRM.** Менеджери у полі.
- **Безпека за замовчуванням.** RLS + JWT перед першим фінансово-чутливим блоком.
- **Не переробляємо чуже на новій стеці.** Беремо UX, переписуємо код. Рекламації залишаються у Python+Bitrix — інтегруємо як microservice.

---

## 2. Поточний стан (baseline)

| Параметр | Значення |
|---|---|
| Стек | Next.js 16 + React 19 + TS + Tailwind 4 + shadcn |
| База даних | Supabase Postgres (Free tier) |
| Хостинг | Vercel (master auto-deploy) |
| 1С integration | 13 actions через `/api/onec` proxy |
| Тести | 240 кейсів (`tsx --test`) + arch-guard |
| Зробленого коду | ~57k LOC нетто, 91.3 фактичних годин (≈639–913 human-equivalent) |
| Прод | `etalon-glass-prod-2026-05-29` baseline + `c5a1c96` останній deploy |
| Open backlog | ~33 пункти, TD-4 (RLS off) і TD-11/12/13 (god-components) інтегруємо у цей план |

---

## 3. Стратегічна карта — 4 етапи

| Етап | Назва | Скоуп | 1С нові actions | Зовнішні залежності | Час (frontend) | Ризик |
|---|---|---|---|---|---|---|
| **0** | Architecture + Design Prep | Docs + design exploration + спека контракту з 1С-розробником | 0 (тільки спека) | — | **3-5 днів** (поточний) | Low |
| **1** | Meetings | Перенос 8 основних meeting-функцій у sales-planning з улучшеннями | 0 (існуючі 1С actions з meeting-4.0) | Google Calendar (existing) | **15-20 днів** | Medium |
| **1.5** | **Sales Detail Foundation** (paralelно зі Stage 1) | Бекфіл line-item продажів з 1С у наш Postgres (з 2025-01-01) + щоночна синка current+previous month. Фундамент для аналітики/звітів. Pure data, без UI. Деталі: [stage-1.5-sales-detail.md](planning/stage-1.5-sales-detail.md) | **2 нових 1С actions** (batch + per-client) | — | **5-7 днів** frontend | Low (data only) |
| **2A** | Receivables (Debtors) | Дебіторка з 1С: список, aging, по клієнту | **5 нових 1С actions** | — | **5-7 днів** | Medium |
| **2B** | Reclamations | Інтеграція reclamation-app як microservice; widget на client card + deep-link | 0 (зовнішня система) | Bitrix24 + TG bot + Python service | **3-4 днів** | Low |
| **3** | Orders / Realizations | UI lift з meeting-app + backend з нуля | **8-10 нових 1С actions** | — | **15-20 днів** | High |

**Загальна оцінка для frontend:** ~10-12 робочих тижнів (без 1С-черги, яка йде паралельно).
**Критична залежність:** черга 1С-розробника на нові actions для етапів 2A і 3.

---

## 4. Архітектурні рішення (ADR-каталог)

| # | Рішення | Файл |
|---|---|---|
| ADR-1 | 1С — source of truth, наш app — буфер + UI | [decisions.md](planning/decisions.md) |
| ADR-2 | Buffer pattern: instant write → cron batch у 1С з retry+DLQ | |
| ADR-3 | Refactor god-components — паралельно з фічами (не окремий етап) | |
| ADR-4 | Увімкнути RLS перед першим sensitive-блоком | |
| ADR-5 | Meeting код переписуємо на наш стек, не мігруємо | |
| ADR-6 | Sync-status — first-class UI-елемент | |
| ADR-7 | Геолокація — read-only, explicit на fail, manual fallback, конфіг timeout | |
| ADR-8 | TTL для кешу: дебіторка 10хв / клієнти 1год / заказы каталог 6год | |
| ADR-9 | Failed-sync рядки повертаємо у UI як «потребує правки» | |

Деталі і обґрунтування — `docs/planning/decisions.md`.

---

## 5. Архітектура переходящих блоків

### 5.1 Shared компоненти-примітиви

Компоненти, що використовуються 2+ модулями. Виносимо у `src/components/crm-shared/` у момент другого використання (DRY-on-second-use).

| Компонент | Використовується у | Локація | Ключові props |
|---|---|---|---|
| `<ClientPicker>` | Meeting form, Order form, Reclamation widget | `crm-shared/client-picker.tsx` | `value, onChange, managerLogin, allowGlobalSearch?` |
| `<ClientCard>` (мінікартка + drill) | `/clients`, Meeting detail, Order detail | `crm-shared/client-card.tsx` | `clientId, variant: 'mini' \| 'full', onClick?` |
| `<AddressField>` (geo capture + manual + map preview) | Meeting form, Order delivery, Client edit | `crm-shared/address-field.tsx` | `value, onChange, mode: 'geo' \| 'manual', onGeoFail?` |
| `<StatusBadge>` (sync + entity status) | Скрізь | `ui/status-badge.tsx` | `status, kind: 'sync' \| 'meeting' \| 'order'` |
| `<BrandPicker>` | `/clients`, Order form, Survey form | `crm-shared/brand-picker.tsx` | `value, onChange, multi?` |
| `<PeriodFilter>` (вже є) | Meetings dashboard, Orders, Debtors | `layout/period-filter.tsx` | — (вже існує) |
| `<SyncRetryToast>` | Скрізь де є sync операції | `ui/sync-retry-toast.tsx` | `failedCount, onClick` |

### 5.2 Domain folders (нова структура)

Замість поточного звалища `src/components/dashboard/`:

```
src/
├── lib/
│   ├── meetings/       — types, hooks, API клієнт, sync logic
│   ├── clients/        — переїзд з поточного коду + extending
│   ├── orders/         — нова
│   ├── debtors/        — нова
│   ├── reclamations/   — нова (тонкий клієнт reclamation-app API)
│   └── crm-shared/     — buffer-pattern helpers, sync types
├── components/
│   ├── meetings/       — Dashboard, Form, Detail, GeoCapture, Survey
│   ├── clients/        — переїзд з clients-page.tsx (1855 рядків → розбиваємо)
│   ├── orders/
│   ├── debtors/
│   ├── reclamations/
│   └── crm-shared/     — ClientPicker, ClientCard, AddressField, BrandPicker
└── app/
    ├── meetings/       — page.tsx + nested routes
    ├── clients/        — існує
    ├── orders/         — нова
    └── debtors/        — нова
```

Поточні `dashboard/manager-dashboard.tsx`, `dashboard/rm-dashboard.tsx`, `dashboard/director-dashboard.tsx` лишаються у `dashboard/` як директорські view; меняти не треба.

### 5.3 Data flow

```
                    ┌────────────────────────────────┐
                    │           1С (HTTP)             │
                    │  (source of truth — ADR-1)      │
                    └──────────┬───────────┬─────────┘
                               │           │
                  reads (TTL)  │           │ writes (batch)
                               ▼           ▲
            ┌──────────────────────────────────────────┐
            │     /api/onec proxy (Next.js Route)      │
            │  + sync-worker (Vercel Cron, hourly)     │
            └──────────┬───────────────────────┬───────┘
                       │                       │
              SWR cache│                       │ batch upsert/upsert
                       ▼                       ▼
            ┌──────────────────────┐  ┌────────────────────┐
            │ Read endpoints       │  │ Write endpoints    │
            │ (debtors, clients,   │  │ (meetings, orders) │
            │  orders, reclam.)    │  │ → meeting_syncs,   │
            │                      │  │   order_syncs      │
            └──────────┬───────────┘  └────────┬───────────┘
                       │                       │
                       │   Supabase Postgres   │
                       │   (RLS — ADR-4)       │
                       │                       │
                       └───────────┬───────────┘
                                   │
                                   ▼
                       ┌────────────────────────┐
                       │ React UI (SWR + JWT)   │
                       │ Status badges (ADR-6)  │
                       └────────────────────────┘
```

Окремий контур для рекламацій:

```
React UI ──▶ /api/reclamations ──▶ reclamation-app FastAPI ──▶ Bitrix24
                                            │
                                            ▼
                                       Telegram Bot
```

### 5.4 Buffer-pattern infrastructure (для зустрічей + заказів)

**Tables (на Supabase):**

```sql
-- Приклад для meetings. Аналогічно для orders.
CREATE TABLE meetings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_login text NOT NULL,
  client_id_1c  text NOT NULL,
  date          date NOT NULL,
  time          time NOT NULL,
  status        text NOT NULL,        -- meeting status (planned, in_progress, done, etc.)
  purpose       text,
  comment       text,
  planned_address text,
  start_address text,
  start_lat     numeric(9,6),
  start_lon     numeric(9,6),
  end_address   text,
  end_lat       numeric(9,6),
  end_lon       numeric(9,6),
  geo_manual    boolean DEFAULT false,
  calendar_event_id text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TABLE meeting_syncs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id    uuid REFERENCES meetings(id) ON DELETE CASCADE,
  status        text NOT NULL,        -- pending | syncing | synced | failed
  operation     text NOT NULL,        -- save | update | start | finish
  payload_snapshot jsonb,             -- що відправляли у 1С
  onec_response jsonb,                -- відповідь 1С
  failure_reason text,
  retry_count   int DEFAULT 0,
  next_retry_at timestamptz,
  synced_at     timestamptz,
  created_at    timestamptz DEFAULT now()
);

-- RLS policies — manager бачить тільки свої meetings
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY meetings_manager_select ON meetings
  FOR SELECT USING (manager_login = current_setting('app.login', true));
-- ...analogous insert/update policies
```

**Sync worker (Vercel Cron):**

```typescript
// /api/cron/sync-meetings — runs hourly via vercel.json
export async function GET() {
  const pending = await fetchPendingSyncs('meeting_syncs', limit=50);
  for (const sync of pending) {
    try {
      const r = await callOneC(sync.operation, sync.payload_snapshot);
      await markSynced(sync.id, r);
    } catch (err) {
      await markFailed(sync.id, err.message);
      // ADR-9: failed не блокує наступні
    }
  }
}
```

**UI subscription:** SWR ключ `meetings:{login}:{period}` + `meeting_syncs:{login}` — дашборд показує badge на кожній зустрічі за статусом найновішого sync-запису.

---

## 6. ЕТАП 0 — Підготовка (поточний, ще йде)

**Deliverables:**

- ✅ Аудити: `metting-4.0`, `meeting-app`, `reclamation-app` → `findings.md`
- ✅ 9 ADR → `decisions.md`
- ✅ Цей план → `PROJECT_PLAN.md`
- ✅ `progress.md` як sprint-tracker
- ⏳ Design exploration (3-4 варіанти у `public/design-meetings-*.html`) — після твердження плану
- ⏳ Feature-branch `feature/meetings-module` — створюємо після твердження плану
- ⏭ 1С-спека (`docs/1C_NEW_ACTIONS_SPEC.md`) — **після узгодження повної логіки кожної фічі**

**Estimated remaining:** 1-2 дні після твого «добро» на план (design exploration).

---

## 7. ЕТАП 1 — Зустрічі (Meetings)

### 7.1 Scope

| 🔥 Core (sprints 1-3) | 🟡 Supporting (sprints 4-5) | ⏭ Skipped |
|---|---|---|
| Login (наш JWT) | Reschedule + conflict check | Client report (вже у `/clients`) |
| Dashboard + дата-фільтр + клієнт-фільтр + widgets | Survey/Anketa з versioned schema | Clients page (вже `/clients`) |
| Create meeting | PeriodFilter (вже є) | Add Client (поки skip) |
| Edit meeting | | API token + CORS (окремий хардненинг) |
| Start meeting + геолокація (ADR-7) | | |
| Finish meeting + end geo | | |
| Calendar sync worker | | |
| Buffer sync worker (ADR-2) | | |
| Status badges (ADR-6) | | |

### 7.2 Sprint decomposition

| # | Спринт | Скоуп | Файли | Час | Залежності |
|---|---|---|---|---|---|
| 1.1 | Schema + Auth bridge + RLS | Migration: `meetings`, `meeting_syncs` tables, RLS policies, JWT login claim у `auth.uid()`-equivalent. Тести RLS. Backup перед увімкненням | `supabase/migrations/`, `src/lib/session.ts` | 2 д | — |
| 1.2 | Dashboard skeleton + фільтри | `/meetings` page, list of meetings зі статус-бейджами, дата-фільтр через PeriodFilter, клієнт-фільтр (ClientPicker primitive), widgets (Total/Completed/Overdue) | `src/components/meetings/*`, `src/lib/meetings/use-meetings.ts` | 3 д | 1.1 |
| 1.3 | Create + Edit meeting | Form з ClientPicker, AddressField, статус. Buffer-write у Postgres. Status badge. **Design exploration спочатку** | `src/components/meetings/meeting-form.tsx`, `src/lib/meetings/save.ts` | 3 д | 1.2 + design-vote |
| 1.4 | Geolocation (start/finish) — ADR-7 | GeoCapture component з retry, manual fallback, configurable timeout. Lat/lon видимі. Explicit toast на fail | `src/components/meetings/geo-capture.tsx` | 2 д | 1.3 |
| 1.5 | Buffer sync worker + retry/DLQ | `/api/cron/sync-meetings`, Vercel Cron schedule, per-record retry. UI індикатор `pending` / `failed` рядків | `src/app/api/cron/sync-meetings/route.ts`, `vercel.json` | 2 д | 1.3, 1.4 |
| 1.6 | Calendar sync worker | Винесено з 1С-proxy: `/api/cron/sync-calendar` з queue або черга у `calendar_syncs` table. Retry+DLQ для Google API failures | `src/app/api/cron/sync-calendar/route.ts`, `src/lib/google-calendar.ts` | 2 д | 1.3 |
| 1.7 | Reschedule + conflict check | Edit form + перевірка clash з іншою активною зустріччю менеджера | `src/components/meetings/reschedule-modal.tsx` | 1 д | 1.5 |
| 1.8 | Survey/Anketa + versioned schema | Survey form, `meeting_surveys` table з версіями полів, JSON-blob у 1С для legacy | `src/components/meetings/survey-form.tsx`, migration | 2 д | 1.5 |
| 1.9 | God-component refactor on-touch (ADR-3) | По мірі торкання `/clients` для ClientPicker і ClientCard primitive — виносимо у crm-shared. Цільова межа ≤500 рядків | `src/components/clients/*`, `src/components/crm-shared/*` | 1-2 д | continuous |
| 1.10 | Mobile QA + polish + deploy | Playwright проганяє на iPhone-широті, перевіряємо геолокацію (mock), buffer-status. Merge у master. Etalon-tag | `scripts/qa-mobile.mjs` | 1 д | 1.5-1.9 |

**Total Етап 1:** ~18-20 робочих днів.

### 7.3 1С dependencies

**Існуючі actions у `/api/onec` (вже працюють у meeting-4.0):**

- `login`, `getInitialData`, `saveNewMeeting`, `updateMeeting`, `startMeeting`, `findClient`, `getManagerClients`, `getClientReport`, `saveClientSurvey`, `getAllMeetingsForClient`, `updateMeetingCalendarId`

**Дії з боку 1С-розробника:** жодних нових actions для Етапу 1. Тільки переконатися що контракт payload/response не зміниться (це треба зафіксувати у `docs/1C_API_SPECIFICATION.md` як «contract version: meeting-4.0 baseline»).

### 7.4 Risks

| Ризик | Імовірність | Вплив | Mitigation |
|---|---|---|---|
| Buffer-worker не справляється з retry-логікою (race з UI editing) | M | H | Per-record state machine + Postgres advisory locks. Тестуємо у Sprint 1.5 |
| Calendar sync regressions (менеджери звикли) | H | M | Воркер з retry+DLQ + canary в одного менеджера. Швидкий rollback |
| RLS зламає існуючі ендпоінти при увімкненні | M | H | Спочатку shadow-mode (RLS у `restrictive: false`), миграція політик з тестами, тільки потім enforce |
| God-component refactor зачепить більше ніж очікувалось | M | M | Boundaries першими (ClientCard / ClientPicker), решта потім |

---

## 8. ЕТАП 2A — Дебіторка (Receivables)

### 8.1 Scope

- Список дебіторів менеджера з aging (30/60/90/90+ днів)
- Деталь по клієнту: розрахункові документи, суми, дати
- Widget на client card: «Заборгованість X, протермінована Y»
- Аналітика для директора (опційно — після core)

### 8.2 Data schema

Тільки кеш — даних own нема (1С — source of truth).

```sql
CREATE TABLE debtors_cache (
  client_id_1c  text NOT NULL,
  manager_login text NOT NULL,
  total_amount  numeric(15,2),
  overdue_amount numeric(15,2),
  aging_30      numeric(15,2),
  aging_60      numeric(15,2),
  aging_90      numeric(15,2),
  aging_90_plus numeric(15,2),
  documents     jsonb,        -- список документів від 1С as-is
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id_1c, manager_login)
);
-- TTL 10 хв (ADR-8). Інвалідація — або по часу або manual.
```

### 8.3 1С dependencies — нові actions (потрібна спека)

| Action | Призначення |
|---|---|
| `getDebtorsByManager` | Список усіх дебіторів менеджера з aging |
| `getDebtorByClient` | Деталь по конкретному клієнту: документи, проводки |
| `getReceivablesAging` | Aging summary (по менеджеру / регіону / компанії) |
| `getReceivablesByDate` | Дебіторка на конкретну дату (для звітів) |
| `getPaymentHistory` | Історія платежів клієнта (опційно для core) |

Точна payload/response specifika — у `docs/1C_NEW_ACTIONS_SPEC.md` _після узгодження логіки фіч_.

### 8.4 Sprint decomposition

| # | Спринт | Час |
|---|---|---|
| 2A.1 | Migration + cache strategy + invalidation | 1 д |
| 2A.2 | API integration з 1С (після того як 1С actions готові) | 2 д |
| 2A.3 | UI: widget на client card + standalone `/debtors` view + drill-down | 2-3 д |
| 2A.4 | Mobile QA + deploy | 1 д |

**Total Етап 2A:** 6-7 днів frontend. **Критичне:** залежить від готовності 1С-actions.

---

## 9. ЕТАП 2B — Рекламації (Bitrix24 + TG)

### 9.1 Scope

Підхід: **Option D з findings.md** — reclamation-app залишається окремим Python-сервісом, інтегрується через REST API.

- Widget на client card у sales-planning: «Активні рекламації: N» + останні 3 заявки
- Кнопка «Відкрити рекламації» → deep-link у reclamation-app (нова вкладка)
- Опційно у майбутньому: створення нової рекламації прямо з sales-planning через прокі-роут

### 9.2 Integration approach

**Зміни у reclamation-app (Python):**

- Додати endpoint `POST /api/claims_by_client` (login + clientId) → повертає масив заявок цього клієнта
- Додати endpoint `GET /api/claims_count_by_manager/{login}` → лічильник активних

**Зміни у sales-planning (Next.js):**

- `src/lib/reclamations/use-claims-by-client.ts` — SWR хук, TTL 5 хв
- `src/components/clients/reclamations-widget.tsx` — мінікартка у client-page drill
- Auth: shared токен між sales-planning і reclamation-app (env var)

### 9.3 1С dependencies

**Нуль.** Рекламації — окрема система.

### 9.4 Sprint decomposition

| # | Спринт | Сторона | Час |
|---|---|---|---|
| 2B.1 | Розширення reclamation-app API (новий endpoint claims_by_client) | Python (я → reclamation-app repo) | 1-2 д |
| 2B.2 | Widget на client card у sales-planning + deep-link | Next.js | 1 д |
| 2B.3 | Mobile QA + deploy | — | 0.5 д |

**Total Етап 2B:** 3-4 дні (більшість зусиль — у reclamation-app, не sales-planning).

---

## 10. ЕТАП 3 — Заказы / Реалізації

### 10.1 Scope

UI lift з `meeting-app` (`orders.js` + сторінки) на нашу стеку + backend з нуля. Multi-currency UAH/USD, cart, contract picker, delivery types, payment types, gift logic.

### 10.2 Data schema

```sql
CREATE TABLE orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number_1c     text,                  -- ЗИН00003082, заповнюється після sync
  doc_type      text NOT NULL,         -- order | realization
  posted        boolean DEFAULT false,
  manager_login text NOT NULL,
  client_id_1c  text NOT NULL,
  contract_name text,
  contract_currency text,              -- UAH | USD
  total_amount_usd numeric(15,2),
  delivery_type text,                  -- courier|pickup|nova_poshta|manager
  delivery_address text,
  payment_type  text,                  -- cash|cashless|deferred
  comment       text,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid REFERENCES orders(id) ON DELETE CASCADE,
  product_name  text NOT NULL,
  qty           numeric(10,3) NOT NULL,
  price_usd     numeric(12,2) NOT NULL,
  is_gift       boolean DEFAULT false
);

CREATE TABLE order_syncs (  -- аналогічно meeting_syncs
  -- ...
);
```

### 10.3 1С dependencies — нові actions (потрібна спека)

| Action | Призначення |
|---|---|
| `getCatalog` | Каталог продуктів (з restriction-прапорцями) |
| `getOrderClients` | Клієнти доступні менеджеру для заказів (з контрактами) |
| `getContracts` | Контракти конкретного клієнта (з currency) |
| `saveOrder` | Зберегти чернетку заказу |
| `postOrder` | Перевести у formed (provedeno у 1С) |
| `createRealization` | Створити реалізацію на основі заказу |
| `getAvailableGifts` | Подарунки доступні для додавання у заказ |
| `validateOrder` | Перевірка валідності перед provedeniem |
| `getOrderHistory` | Історія заказів клієнта/менеджера |

Точна payload/response — у `docs/1C_NEW_ACTIONS_SPEC.md` після узгодження логіки.

### 10.4 Sprint decomposition

| # | Спринт | Скоуп | Час |
|---|---|---|---|
| 3.1 | Schema migration + RLS + Order list skeleton | 2 д |
| 3.2 | Catalog + ClientPicker context для замовлення | 2 д |
| 3.3 | Add Order form (cart, contract, delivery, payment) — **design exploration перед кодом** | 3-4 д |
| 3.4 | Multi-currency логіка з re-mark prices | 1 д |
| 3.5 | Gift logic (UI вибору, restriction check, backend tracking) | 2-3 д |
| 3.6 | Order detail + status changes (draft → formed → realization) | 2 д |
| 3.7 | Buffer-sync worker для orders (re-use Etap 1 pattern) | 1 д |
| 3.8 | Mobile QA + deploy | 1 д |

**Total Етап 3:** ~14-18 днів frontend. **Критичне:** готовність 1С-actions.

---

## 11. Cross-cutting concerns

### 11.1 Безпека

- **RLS** (ADR-4): спочатку для нових таблиць (`meetings`, `debtors_cache`, `orders`, etc.), потім ретроспективно для існуючих (`forecasts`, `gap_closures`, `users`). Shadow-mode → enforce.
- **JWT-cookie** (вже є у sales-planning): додаємо `login` claim як параметр `current_setting('app.login')` для RLS-політик.
- **IDOR closure** на `getClientReport`/`getAllMeetingsForClient`: при кожному виклику перевіряти що `clientId` належить менеджеру (через `getManagerClients` cache).
- **Secret rotation**: Bitrix webhook URL → env, TG bot token → env, 1С credentials → ротація раз/квартал.

### 11.2 Geolocation (ADR-7)

Реалізація у `src/components/crm-shared/address-field.tsx`:

```typescript
<AddressField
  mode="geo"                          // 'geo' | 'manual'
  timeoutMs={GEO_TIMEOUT_MS}          // env, default 15000
  onCapture={({lat, lon, address}) => ...}
  onFail={({reason}) => showToast({reason, retry: () => ...})}
  onManualEntry={(address) => setGeoManual(true, address)}
/>
```

### 11.3 Calendar sync worker

Окремо від основного sync-воркеру:

- Своя таблиця `calendar_syncs` з payload (meeting snapshot, operation: insert/update/delete)
- Cron щохвилини (інше TTL ніж meetings — Calendar має бути швидким)
- Retry exponential backoff (1m, 5m, 15m, 1h, fail)
- DLQ rows: окремий UI у адмінці «помилки Calendar», ручний resync

### 11.4 God-component refactor (ADR-3)

Не окремий етап. По мірі торкання:

- `clients-page.tsx` (1855) — розбиваємо при роботі над ClientPicker / ClientCard primitives у Етапі 1
- `planning-form.tsx` (2272) — зачіпаємо тільки якщо буде новий блок (наразі не планується для CRM-розширення)
- `company-overview-dashboard.tsx` (1176) — стабільний, не чіпаємо без потреби

Boundary: новий код у нових файлах ≤500 рядків. Старий — рефакторимо коли торкаємось.

### 11.5 Testing strategy

- Поточний baseline: 240 кейсів `tsx --test` + arch-guard. Зберігаємо.
- Нові таблиці → нові unit-тести бізнес-логіки (наприклад, retry state machine для sync-worker)
- RLS → integration-тести з шаблоном «менеджер A не бачить дані менеджера B»
- Playwright QA → mobile scenario для геолокації (mock + permission denied + timeout)
- Pre-push hook: `tsx --test && tsc --noEmit && check:arch` лишається

### 11.6 Backup + RLS migration

Перед увімкненням RLS:

1. Backup всіх таблиць через `scripts/backup-supabase.mjs`
2. Створити RLS-політики у shadow-mode (`RESTRICTIVE: false`)
3. Прогнати тестовий набір користувачів
4. Активувати enforce (`RESTRICTIVE: true`)
5. Smoke-тест прод

Якщо Supabase Free лімітує — переходимо на Pro ($25/міс) перед Етапом 2A (фінансово-чутливі дані заслуговують PITR).

---

## 12. Risk register (top 10)

| # | Ризик | Етап | Probability | Impact | Mitigation |
|---|---|---|---|---|---|
| 1 | 1С-черга на нові actions затримає Етапи 2A і 3 | 2A, 3 | H | H | Скласти спеку зараз (як умовлено — після логіки), 1С-розробник стартує паралельно з Етапом 1 |
| 2 | Buffer-worker race conditions при concurrent edit + sync | 1 | M | H | Per-record advisory locks, тестуємо у Sprint 1.5 |
| 3 | Google Calendar API rate-limits на бульшому об'ємі | 1 | M | M | Calendar sync worker з batch + backoff |
| 4 | RLS-міграція зламає існуючі ендпоінти | 1 | M | H | Shadow-mode → enforce, тести на pre-merge |
| 5 | Geolocation у проблемних зонах (підвал, поганий сигнал) | 1 | H | M | Manual fallback (ADR-7), timeout конфігурований |
| 6 | God-component refactor зачепить більше ніж очікувалось | 1, 3 | M | M | Boundary-first refactor (primitives), решта по дотику |
| 7 | Bitrix webhook hardcoded — проблема при rotation | 2B | M | M | Винести у env у Sprint 2B.1 |
| 8 | Supabase Free лімити на CRM-обсязі | 2A+ | M | H | Перехід на Pro перед Етапом 2A; моніторинг |
| 9 | Multi-currency UAH/USD edge cases у заказах | 3 | M | M | Тести re-mark logic; review від користувача перед prod |
| 10 | Менеджери чинять опір новому UI зустрічей | 1 | L | M | Зберігаємо існуючі workflow + текст; rollout через canary 1-2 менеджерів |

---

## 13. Timeline (укрупнено)

```
Тиждень    1 . 2 . 3 . 4 . 5 . 6 . 7 . 8 . 9 . 10 . 11 . 12
ЕТАП 0  ▓▓▓
ЕТАП 1     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
ЕТАП 2A                          ▓▓▓▓▓▓
ЕТАП 2B                              ▓▓▓
ЕТАП 3                                  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓
1С queue   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
                ↑ spec ready    ↑ debtors actions   ↑ orders actions
```

**Приблизний час:** 10-12 робочих тижнів (~3 місяці) frontend. 1С-розробка йде паралельно. Етапи можуть зрушитися залежно від готовності 1С-actions.

---

## 14. Зовнішні залежності

| Залежність | Що треба | Коли |
|---|---|---|
| 1С-розробник | Спека → реалізація actions для 2A (5 шт.) і 3 (8-10 шт.) | Спека готується після узгодження логіки; реалізація — паралельно з Етапом 1 |
| Supabase | Upgrade до Pro ($25/міс) для PITR | Перед Етапом 2A (фінансові дані) |
| Vercel | Cron jobs (потрібен Pro tier якщо більше 2 cron) | До Етапу 1.5 (sync worker) |
| Bitrix24 admin | Доступ до webhook URL ротації + SPA entity schema | Етап 2B |
| Google Calendar | API quota перевірка при більшому об'ємі | Етап 1.6 |
| Sentry (або еквівалент) | Error tracking для прода | NTH-2 у backlog, можна паралельно з Етапом 1 |

---

## 15. Open questions (потребує твого рішення)

| # | Питання | Кінцевий термін |
|---|---|---|
| Q1 | **Calendar sync depth** — повноцінний (як meeting-4.0) чи ICS-export? | До Sprint 1.6 |
| Q2 | Survey questions — змінюємо структуру чи lift-as-is? | До Sprint 1.8 |
| Q3 | Add Client → file upload (з meeting-4.0) — потрібен? | До Sprint 1.x (якщо взагалі робимо) |
| Q4 | Bitrix webhook URL — env-ize у reclamation-app? | До Sprint 2B.1 |
| Q5 | Widget рекламацій на client card — last 3 чи лічильник? | До Sprint 2B.2 |
| Q6 | Supabase Pro upgrade — коли (перед Етапом 1 чи Етапом 2A)? | До Sprint 2A.1 |
| Q7 | Director Dashboard у meeting-app — точно не переносимо? Підтверджено раніше, перепідтверджую перед Етапом 3 | До Етапу 3 |

---

## 16. Наступні дії після твердження плану

1. **Дизайн-розвідка** — згенерую 3-4 варіанти `public/design-meetings-*.html` (Dashboard, Form, Detail) у нашій glass-естетиці. Ти обираєш напрямок.
2. **Feature-branch** — `feature/meetings-module` від master.
3. **Sprint 1.1** — schema + auth bridge + RLS shadow-mode.
4. **Паралельно** — узгоджуємо логіку фіч Етапу 2A і 3, потім пишу `docs/1C_NEW_ACTIONS_SPEC.md` і передаю 1С-розробнику.
5. **Прогрес-трекер** — оновлюю `docs/planning/progress.md` після кожного sprint.

---

## 17. Глосарій

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

---

_Цей документ — джерело правди для проекту CRM-розширення. Оновлюється при кожному значному рішенні. Версіонування — додавати «v2 (date)» при суттєвому перегляді._
