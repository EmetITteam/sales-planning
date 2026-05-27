# Архів планів

Об'єднаний архів виконаних планів розробки. Кожна секція містить оригінальний документ + дату резолюції зверху.

Дивись також: [ARCHIVE_SPECS_RESOLVED.md](./ARCHIVE_SPECS_RESOLVED.md) — архів виконаних специфікацій 1С.

---

# 1. PLAN V2 (2026-05-21 → 2026-05-26)

> **Виконано 2026-05-27.** Track A (Огляд компанії) + Track B (Glass redesign) + Track C (Action 5 includeAll) повністю закриті. Track D — частина тех-боргу винесена у `BACKLOG.md`.

Робочий план на ітерацію. 3 паралельні трекі: новий дашборд для admin, доведення Glass-редизайну, розширення 1С Action 5.

Усе кодиться у гілці **`glass-redesign`** (прод не чіпаємо до фіналу). Поточний прод = etalon-master (комміт `0d4d8ca`).

---

## СТАН на 2026-05-26 (вечір) — після 4-хвильового аудиту + всіх фіксів

### 4-хвильовий аудит сьогодні (Strategy / Security / Engineering / Design)
- 5 design + 4 engineering + 3 security + 3 strategy агентів = **15 точок зору** на code
- 4 нові репо скілів встановлено (ui-ux-pro-max + design-taste + Vercel + engineering-advanced)
- Виявлено ~50 issues з пріоритетами P0-P2

### Фікси сьогодні (15 commits, range 497963b..ce9fc2b)

**Security P0 — ВСІ закриті:**
- C1 (`/api/onec`): strip `includeAll` для не-admin → не можна викрасти дані всієї компанії
- C2 (`/api/admin/company-overview`): гард admin || `canViewCompanyOverview` + re-fetch з БД (не з JWT)
- H1: видалено `NEXT_PUBLIC_API_SECRET_KEY` з 6 файлів (клієнтський bundle leak)
- H2: `.env.example` `NEXT_PUBLIC_DEMO_LOGIN` дефолт "true" → "false"
- Login/onec error sanitize у проді (не показуємо `e.message`)
- Session-expired modal: 401/403 з 1С → AppHeader показує чистий "Увійти знову" модал замість JSON dump

**Tech Debt — ключові закриті:**
- TD-9/10: 4 дубль interface'и → shared `src/lib/company-overview-types.ts` (single source). `CompanyClientStats` (5-cat) ↔ `ClientCategoryStats` (3-cat) перейменовано.
- TD-12: 236 hardcoded `#066aab/#0880cc/#055a91/#e8f4fc/#c5e3f6` → Tailwind tokens `emet-blue/light/dark/50/100` у 25 файлах.
- @tanstack/react-table + date-fns видалено з deps (0 імпортів).

**Performance P1:**
- `useMemo` для `heatmapRows`/`groupsForAccordion`/`brandsForAccordion`/`filteredTotal*` — раніше ~300 операцій на toggle accordion, тепер 0.
- Zustand selectors замість деструктурування — кожен компонент підписаний тільки на потрібні слайси.

**a11y P0:**
- 9× `<div onClick>` → `<button type="button" aria-expanded>` (region-accordion 3 layouts, manager-accordion 2 layouts, planning-readiness, company-overview 3 levels)
- Focus-visible ring 2px EMET-blue/50 на всіх accordion buttons
- h2 → h1 у director + RM dashboards (heading hierarchy WCAG 1.3.1)

**Нова preview-сторінка:**
- `/admin/analytics-preview` — draft з 5 B2B-метриками що audit рекомендував (Pipeline coverage, NRR, AOV per brand, Stage-done ratio, Brand mix concentration). Лінк додано у /admin landing. Чекаємо оцінку чи інтегрувати.

**Design polish:**
- Hover lift `-translate-y-px` (1px sub-perceptible) → `translateY(-4px)` cubic-bezier 0.4s
- Cursor-radial gradient opacity 0.5 → 0.85 (раніше було ледь видно)
- Hover shadow з EMET-blue tint замість generic dark
- Hero numbers: useCountUp hook 0→target 600ms ease-out cubic
- Hero grid: stagger fade-in 60ms per card (preview-cinematic feel)

**Docs:**
- `SPEC_CLIENTSTATS_DISCREPANCY.md` — питання Андрію про розбіжність totalClients vs sum-of-categories у Action 5 clientStats (B2)

---

## СТАН на 2026-05-25 (попередній день)

### Великі плити що вже стоять
- **Track A повністю готовий** — Огляд компанії з усіма UI-елементами (4 hero + 3 donut + heatmap + accordion 2 режими + клієнтська карта). Доступ через M10 permissions.
- **Track B Stage 3-5 завершено** — Glass-стиль на усіх дашбордах + admin + planning форми + accordions. Cursor-following gradient + pulse-dot на hero (preview-style).
- **Track C закрита** — Андрій задеплоїв `includeAll: true` у Action 5. Вже отримуємо 19 регіонів (з 11). Жодних н/д більше у Огляді.
- **TD-1 (trial $1 sentinel)** — реалізовано і у backend (route.ts) і у region-aggregates (Director/RM). Дані сходяться між дашбордами.

### Релізи сьогодні (2026-05-25)
- `1df5623` — period filter уніфікація (один globalPeriod на всю app + auto-roll до новішої неділі)
- `b4f9a73` — wire `includeAll=true` (Андрій задеплоїв) → +4 підрозділи з фактом
- `7615ed8` — UX overhaul donut/heatmap/accordion (динамічні titles, % частка, бренди в розкритті)
- `08d2199` — trial $1 sentinel filter + nested drill-in (регіон → бренди) + Director label «Огляд по представництвах»
- `2812cb7` — heatmap «0%» замість «н/д» коли план є а факту 0 + by-brand розгортається у 8 регіонів окремо
- `7f95711` — «Клієнти-покупці» картка + refresh button фікс (cache:no-store + force-dynamic)
- `611b4ed` — `asOfDate` end-to-end (frontend → backend → 1С), клієнтська карта тільки для reps+CC, 4-та hero «Робочі дні»
- `f02e4bb` — visual polish (cursor radial gradient + pulse-dot) + Норма на ранок + Робочі дні у hero1 + `divisionsNotInPlan`
- `5bbbcb5` — design audit pass (bg-fafbfe → glass + MetricCard pulse-dot + «Відстають від плану»)
- `e881d1f` — $1 trial filter у region-aggregates (всі дашборди узгоджуються) + Прогноз (темп) + % delta біля відстаючих
- `07c22e6` — «Купивші клієнти» → «Покупці місяця»
- `20f7bd5` — компактний «Відстають від плану» + спрощений subtitle

---

## Track A · Admin «Уся компанія» дашборд

### ЗАВЕРШЕНО

**Структура UI** (фінальна, після ітерацій 22-25.05):

| Секція | Стан |
|---|---|
| **Контекст бейдж** | Період з глобального стору + LIVE pill коли активний |
| **4 Hero cards** | План {filter} · Факт {filter} · Виконання (з нормою на сьогодні/ранок + Прогноз темп) · Контекстна 4-та: «Відстають від плану» (filter=all) / «Покупці місяця» (filter=reps,cc) / «Робочі дні» (filter=Адасса/Лазерхауз/Дистри) |
| **Фільтр Група** | chip-и: Усі / Представництва / Колл-центр / Лазерхауз / Адасса / Дистрибутори |
| **3 Donut chart-и** | Динамічні titles. (1) Регіони у Представництвах · (2) Підрозділи у факті (split distributors при filter=distri) · (3) Бренди у {filter} |
| **Велика клієнт-карта** | 5 категорій (Активні/Сплячі/Нові/Втрачені/Без закупок) з % купили + vs мин.міс. Тільки для reps/cc/all. |
| **Heatmap** | Підрозділ × Бренд. 0% замість «н/д» де план є. Лише бренди з планом (ховаємо порожні колонки). Без «N менедж.» для не-reps. |
| **Accordion 2 режими** | «Підрозділи→бренди»: для Представництв — nested drill (8 регіонів → бренди регіону). Для не-reps — одразу бренди підрозділу. Колонкові заголовки + % частка. ⇄ «Бренди→підрозділи»: розгортається у 8 регіонів Представництв окремо + інші підрозділи (не груповано). + колонка % бренду |

**Бекенд**:
- `/api/admin/company-overview/route.ts` — `force-dynamic + revalidate=0` (без CDN кешу), приймає `?period=YYYY-MM&asOfDate=YYYY-MM-DD`.
- Викликає **Action 4** (плани) + **Action 5** (факт поточний з includeAll+asOfDate) + **Action 5 prev month** (для delta клієнтів) — 3 паралельні запити.
- Агрегує clientStats per division (v2.5 поле), окремо prev.
- Канонічний список 13 → `divisionsNotInPlan` для контролю.

**Access control** (M10):
- `users.can_view_company_overview` колонка
- `/admin/company-overview-permissions` — toggle UI
- `/api/auth/me` повертає `canViewCompanyOverview`
- `UserSession.canViewCompanyOverview` тип
- Toggle у AppHeader: «Планування ⇄ Огляд компанії» для admin + дозволених юзерів

---

## Track B · Glass Redesign — ЗАВЕРШЕНО

**Stage 1-2** (фундамент, 22.05): mesh background, `.glass-card` utility, blob-и.

**Stage 3** (hero): Manager / RM / Director hero blocks + refetch banners + empty/loading states.

**Stage 4** (accordions): Усі accordion-и переведено на Glass (region/manager/brand-group/category-stats + readiness).

**Stage 5** (planning + admin):
- Planning form + brand-expanded-details
- Admin pages (`/admin/*`)
- Header + period filter

**Бонус сьогодні (25.05)** — preview-стиль інтерактивність:
- Cursor-following gradient на `.glass-card` (radial spotlight за мишкою)
- Pulse-dot animation на indicator точках у hero
- Hover lift + soft shadow на всіх картках
- Один document mousemove listener — без N-на-N

---

## Track C · 1С Action 5 розширення — ЗАКРИТО

Андрій реалізував `includeAll: true` у Action 5. Зараз отримуємо 19 регіонів замість 11. Усі 4 проблемні підрозділи (Колл-центр / Адасса / Полтава / Чернівці) повертають реальний факт.

**Що лишилось у запитах до Андрія** (нова спека потрібна):
- **Action 5 v2.6** — `clientStats.boughtBySegment` (категорія × бренд breakdown). Для матриці «20 активних купили VITARAN, 15 — ESSE...» Зараз ми маємо тільки агрегати per-категорія, не per-бренд.
- **prev month clientStats per category** — потрібно бо vs.минулий місяць є тільки на totalBought (поки що рахуємо через 2 виклики Action 5: поточний + previous).

---

## Track D · Тех-борг

### TD-1 завершено (25.05)
$1 trial sentinel фільтр через `isTrialBrandPlan` helper:
- backend route.ts: пропускає $1 плани з Action 4 → Адасса показує реальний план не 8487 з фейкових
- region-aggregates.ts: те саме на `aggregateRegion` → Director/RM теж сходяться з Огляд компанії
- Результат: усі дашборди показують ідентичний план (раніше була різниця $9 між Director $1,049,925 і Огляд $1,049,916)

### Лишається у бекклогу (винесено у BACKLOG.md)

| # | Що |
|---|---|
| **TD-3** | Свіжий `DATABASE_URL` |
| **TD-7** | Свята 2027 у `working-days.ts` |
| **TD-5** | Винести `SEGMENTS` з `mock-data.ts` → `src/lib/segments.ts` |
| **TD-2** | `MULTI_REGION_RM_OVERRIDES/HOME` → БД таблиця |
| **TD-6** | Прибрати DEPRECATED колонки forecasts.action / gap_closures.action (M11) |
| **TD-8** | Запросити справжні regionCode у Андрія |

### Знайдено наприкінці спринту (нові пендинги — теж винесені)

- **B1**: Director Dashboard порожній при першому логіні поки не зробиш refresh — дослідити race condition між session bootstrap і SWR fetch
- **B2**: Розбіжність clientStats: сума категорій (12769) ≠ totalClients (9111) у Представництвах. Категорія per-клієнт у 1С, але дані не сходяться — нужно з'ясувати з Андрієм
- **B3**: Brand donut/badge стилі — деякі залишилися «синіми прямокутниками»
- **B4**: Tooltip-помічники для метрик («що таке Прогноз/темп?»)

---

## Стейкхолдери

- **Користувач** (IT Director EMET) — веде розробку, дає всі рішення
- **Саша** (Директор продажу) — приймає результат, дає правки по бізнес-логіці
- **Андрій** (1С розробник) — реалізує спеки. **Молодець — Action 5 includeAll виконав швидше очікуваного.**
- **Claude** — виконавець

_Оригінал створено 2026-05-25, оновлювався до 2026-05-26._

---

# 2. План: сторінка «Мої клієнти» + нові метрики з Митинга (2026-05-26)

> **Виконано 2026-05-28.** Сторінка `/clients` випущена в продакшн на гілці `feat/clients-page` → змерджена у `glass-redesign`. Реалізовано 5 нових 1С-actions у whitelist, нова Supabase API `/api/clients/plan-totals`, 5 hooks у `use-my-clients.ts`. Pending: Action B `getClientActivationPlan` + Bug 2 `checkActivities.hasCall` (винесено у `SPEC_PENDING_1C_ITEMS.md`).

**Зафіксовано:** 2026-05-26
**Гілка:** glass-redesign → з неї стартуємо нову `feat/clients-page`
**Стейкхолдери:** Користувач (IT Director EMET), Саша (Директор продажу)

---

## 1. Що ми відкрили: 1С actions у meeting-app

Локальний проект `c:\Users\itd\Projects\apps\meeting-app` — це **redesign-копія Митинга 4.0** (production у `meeting-app-production` чіпати не можна). Він використовує **10 існуючих 1С-actions**, які ми МОЖЕМО викликати з sales-planning без жодних змін у 1С.

### 1.1 Список actions

| Action | Параметри | Що повертає | Login-bound |
|---|---|---|---|
| `getManagerClients` | `{login}` | `{clients[]: {ClientID, clientName, ClientCategory, clientAddress, Phone, managerName, isMine}}` | Так |
| `findClient` | `{searchTerm, managerLogin}` | `{found, clients[]: {...same+isMine}}` | Так (через managerLogin) |
| `getClientReport` | `{clientID}` | `{clientInfo, salesReport.brands[].salesByMonth[], lastMeetings[], lastCalls[], lastSeminars[], yearlySales}` | Ні |
| `getAllMeetingsForClient` | `{clientID}` | список усіх зустрічей | Ні |
| `getInitialData` | `{login, startDateString, endDateString}` | `{meetings[], questions[], potentialCategories[], purposes[]}` | Так |
| `registerNewClient` | `{name, phone, address, education, managerLogin, files[]}` | write — створення клієнта | Так |
| `saveClientSurvey` | survey payload | write | — |
| `startMeeting` / `updateMeeting` / `saveNewMeeting` | meeting payload | write — workflow зустрічей | — |
| `login` | `{login, password}` | session — НЕ використовуємо тут (у нас своя auth) | — |

### 1.2 Деталі найважливіших actions

#### `getClientReport({clientID})` — найкорисніший
```ts
{
  clientInfo: {
    id, name, address, category, phone, education, documents (bool)
  },
  salesReport: {
    periodStart, periodEnd,  // 3-міс період
    brands: [{
      brandName,
      totalAmount,
      salesByMonth: [{month: "Травень 2026", amount: 420}, ...]
    }]
  },
  lastMeetings: [{date, comment}],
  lastCalls: [{date, comment}],
  lastSeminars: [{date, comment}],
  yearlySales: ... // тренд за рік
}
```

#### `getManagerClients({login})` — bulk-список клієнтів
```ts
{
  clients: [{
    ClientID, clientName,
    ClientCategory,  // "Новий" | "Активний" | "Сплячий" | "Без закупок" | "Потерянный" | null
    clientAddress, Phone,
    managerName, isMine  // isMine=false означає що клієнт чужий, але потрапив у пошук
  }]
}
```

#### `findClient({searchTerm, managerLogin})` — глобальний пошук
Шукає по всій базі (не лише свої). `isMine:false` для чужих — їх можна показувати read-only.

---

## 2. Що НЕ змінюємо у sales-planning при інтеграції

- **Не міняємо** 1С-розробникові код. Все вже існує.
- **Не дублюємо** методи. Просто додаємо у whitelist `/api/onec/route.ts` чотири нові actions: `getManagerClients`, `findClient`, `getClientReport`, `getAllMeetingsForClient`.
- **Не дублюємо** auth. Наша сесія `sp_session` залишається; усі нові actions проходять через наш login-override (LOGIN_BOUND_ACTIONS додаємо `getManagerClients` + `findClient`).
- **Не торкаємось** Митинг-репо. Sales-planning — окремий проект. Просто читаємо ті самі 1С endpoint-и.

---

## 3. План: сторінка «Мої клієнти» (v3c → продакшн)

### 3.1 Мокап
`public/clients-view-v3c.html` — фінальний (затверджений 2026-05-26).

Структура:
- **Hero band 4 картки** (MetricCard): План місяця · Факт+сер.чек · Виконали план N/42 · По категоріях (4 рядки списком)
- **Filter pills**: Усі · Активні · Сплячі · Нові · Втрачені · Невиконані→Виконані (sort)
- **4 категорійні секції** (Активні/Сплячі/Нові/Втрачені), у кожній:
  - Невиконані спочатку → divider «—— ВИКОНАЛИ ПЛАН ——» → виконані з тегом «Виконав заплановане»
  - Клієнт-рядок (glass-card з manager-accordion patternом): avatar+name+sub · Факт/План mono · міні-progress-bar · status-pill · chevron expand
  - Розгортання — список брендів: бренд · план · факт · сер. чек · подія (є/нема) · виконання %

### 3.2 Реалізація сторінки
Маршрут: `/clients` (доступ — manager / rm / admin · admin бачить чужих read-only)

API hook: `useClientList()` — паралельно:
- `/api/onec` → `getManagerClients({login})` → список + категорії + телефони
- `/api/onec` → `getRegionData({login, periodId, includeAll:false})` → план/факт по клієнту×бренду цього місяця
- `/api/planning/aggregate?login=...` → finalized forecast+gap з Supabase

Hook `useClientFullProfile(clientID)` (lazy при кліку на рядок):
- `/api/onec` → `getClientReport({clientID})` → 3-міс історія + події + clientInfo

### 3.3 5 пунктів-вимог користувача (затверджено 2026-05-26)
| # | Що | Звідки дані |
|---|---|---|
| 1 | Пошук по контрагенту | `findClient` (global) + client-side filter серед `getManagerClients` |
| 2 | Факт по бренду навіть без плану | `getRegionData` clientStats (вже маємо) |
| 3 | «Потенціал купівлі» (купував 3 міс, цей пусто) | `getClientReport.salesReport.brands.salesByMonth` |
| 4 | Тип події (call/meeting/seminar) | `getClientReport.lastMeetings/lastCalls/lastSeminars` |
| 5 | Тип контрагенту + телефон + освіта | `getClientReport.clientInfo` + `getManagerClients.Phone/ClientCategory` |

---

## 4. Нові метрики для дашбордів (Огляд + РМ + Менеджер)

### 4.1 ТОП-5 пропозицій — найкорисніше

#### № 1 «Холодні клієнти» (last touch > 30 днів)
- **Що**: Картка/блок на РМ-дашборді показує клієнтів які активні в 1С (категорія = Активний), мають план, але **жодного контакту > 30 днів**.
- **Джерело**: `getClientReport.lastMeetings/lastCalls/lastSeminars` — беремо max(date) → diff від сьогодні.
- **Цінність**: Зараз ніде не видно. Менеджер може забути дзвонити постійному клієнту.
- **Вартість**: ~3 год.

#### № 2 Авто-prefill прогнозу з 3-міс історії
- **Що**: У формі планування під кожним полем «прогноз» для клієнта × бренду показати «↩ Бер $420 · ↩ Кві $380 · ↩ Тра $400 → пропозиція $400». Кнопка «прийняти» — і прогноз заповнюється.
- **Джерело**: `getClientReport.salesReport.brands.salesByMonth`.
- **Цінність**: Менеджер заповнює прогнози **на 60% швидше**.
- **Вартість**: ~6 год.

#### № 3 «Активні + нема контактів»
- **Що**: Менеджерський дашборд — окрема картка «5 клієнтів — план $12K, контактів 0 цього місяця». Drill-down → список.
- **Джерело**: `getAllMeetingsForClient` ∩ поточний місяць + наш plan>0.
- **Вартість**: ~2 год.

#### № 4 Conversion: дзвінки/зустрічі → продажі
- **Що**: Admin-дашборд — KPI «% клієнтів які купили після дзвінка / після зустрічі» по менеджеру.
- **Джерело**: кореляція дат `lastCalls/lastMeetings` з фактом купівель (Action 5).
- **Вартість**: ~5 год.

#### № 5 «Втрата якорного бренду»
- **Що**: Менеджерська/РМ-картка-попередження: «Клієнт N купував Vitaran 3 місяці поспіль і раптом перестав».
- **Джерело**: `getClientReport.salesReport.brands.salesByMonth` — детект «3 з 3 → 0 цього міс».
- **Вартість**: ~3 год.

### 4.2 Priority 2 (потім)

| № | Що | Джерело |
|---|---|---|
| 6 | Категорії клієнтів з 1С довідника замість хардкоду | `getInitialData.potentialCategories` |
| 7 | Сегментація по освіті (середній чек дерматолог vs косметолог) | `clientInfo.education` |
| 8 | Suggest «додати у план» (купував мин.міс, нема плану) | `getClientReport.salesReport` |
| 9 | Tap-to-call телефон | `clientInfo.phone` |
| 10 | Графік покупок за рік | `getClientReport.yearlySales` |

### 4.3 Що НЕ дає новий API
- Дебіторка (моки у Митингу)
- Замовлення (моки у Митингу)

---

## 5. Порядок робіт — виконано

| Етап | Зміст | Стан |
|---|---|---|
| **A** | Сторінка `/clients` (v3c → продакшн) | Зроблено 2026-05-28 |
| **C** | Авто-prefill прогнозу (#2) у формі планування | Backlog |
| **B** | Нові картки Огляду/РМ: «Холодні клієнти», «Активні без контактів», «Втрата якорного бренду» (#1, 3, 5) | Backlog |
| **D** | Admin-дашборд conversion-KPI (#4) | Backlog |
| **E** | Priority 2 покращення (#6-10) | Backlog |

---

## 6. Технічні нотатки для імплементації

### 6.1 Whitelist у `/api/onec/route.ts` — реалізовано
```ts
const ALLOWED_ACTIONS = new Set([
  // existing:
  'getClientsForPlanning', 'getSalesFact', 'getRegistryPlans',
  'getRegionData', 'getTrainings', 'checkActivities',
  // NEW (from Митинг):
  'getManagerClients',     // bulk client list
  'findClient',            // search
  'getClientReport',       // 3-month history + events + clientInfo
  'getAllMeetingsForClient',
  'getClientFocus',        // Action A — додано 28.05
]);
```

Для `findClient` — окрема логіка через `managerLogin` поле (не `login`). Реалізовано у `MANAGER_LOGIN_BOUND_ACTIONS`.

### 6.2 Rate limiting
- Поточний ліміт: 60 req/min, 600 req/hour per session.
- `getClientReport` — lazy.
- Bulk-фетч через chunking по 200-400 ID.

### 6.3 Cache
- `getManagerClients` — кешувати на 5 хв (SWR `revalidateOnFocus:false`)
- `getClientReport` — кешувати per-clientID на 10 хв

### 6.4 Типи (у `src/lib/mityng-types.ts`)
Реалізовано: `ClientFromOneC`, `ClientReport`, `BrandSalesHistory`, `ClientEvent`, `ClientSeminar`, `ClientInfoFromReport` + helpers `isClientReserved`, `getClientName`, `getClientAddress`, `getLastMeetingDate`, `getLastCallDate`.

---

## 7. Підсумок

- Все, що користувач хоче для «Мої клієнти», досяжно без чіпання 1С-розробника.
- Митинг 4.0 вже має 10 потрібних actions. Наш `/api/onec` whitelist розширено на 5 пунктів.
- Найбільший потенційний UX-win **не нова сторінка**, а **авто-prefill прогнозу** з 3-міс історії при плануванні (#2 з пропозицій) — в бекклозі.

_Оригінал зафіксовано 2026-05-26._
