# Changelog

Усі помітні зміни Sales Planning. Формат за [Keep a Changelog](https://keepachangelog.com/).

---

## [2026-07-14] · Дашборд-правки: категорії клієнтів, мульти-регіон зустрічі, мобільний Стратегії

### 🆕 «Зустрічі команди» — перемикач регіонів для мульти-регіон РМ

Мульти-регіон РМ (Пашковська: Одеса + Миколаїв) бачила лише домашній регіон, бо 1С у `managedUsers` дає тільки його.

- Для такого РМ (`MULTI_REGION_RM_OVERRIDES`) менеджери всіх її регіонів тягнуться з `getRegionData` (director-proxy + фільтр по regionCodes) + **перемикач «Усі регіони / …»**. Зустрічі всіх регіонів вантажаться один раз, перемикач фільтрує на клієнті. Одно-регіон РМ — без змін.
- `useMeetings` отримав опційний `logins`; `/api/meetings` приймає явний перелік тільки від мульти-регіон РМ / admin / director (cap 60).
- Фікс: імена менеджерів чужого регіону на картках (раніше показувало логін `SM.KHERSON1`).

### 📊 «Клієнти — факт купівель» — Сплячі і Втрачені окремо

Hero-картка більше НЕ складає сплячих із втраченими — тепер **чотири рядки** (Активні / Сплячі / Втрачені / Нові). `ClientCategoryStats` отримав поле `lost`; адаптер, агрегати, всі три дашборди оновлені.

### 📋 «Розклад по категоріях клієнтів» — колонка «% факт 1С» + уточнення підписів

- Нова колонка **«% факт 1С»** = факт категорії / **офіційний план 1С** (регіон / компанія / бренд — той самий ПЛАН МІСЯЦЯ). Сума рядків = загальне виконання плану. Раніше таблиця не порівнювалася з планом 1С взагалі (тільки план менеджерів).
- Підписи: «Активні клієнти (не унікальні)», «Активізація (Сплячі/Втрачені/БЗ, не унікальні)» — рахуються рядки клієнт×бренд, не унікальні клієнти.

### 🐛 Стратегія — горизонтальний вихід за екран на мобільному

`CategoryCard` у `grid-cols-2` розпирав ширину сторінки (мітка виходила за картку без клипу) → шапка переставала переноситись. Додано `min-w-0 + overflow-hidden` на картку, `truncate` на мітку, менше число на мобільному, `overflow-x: clip` на `.sk-page`.

---

## [2026-07-14] · Тимчасовий доступ до регіону + Strategic KPI rollup + прогрів 1С

### 🆕 Тимчасовий доступ до регіону (планёрки)

Директор продажів / асистент / admin видають менеджеру **read-only** перегляд усього регіону на період (регіон → менеджер → дати) — для щотижневих планёрок Києва, де нема закріпленого РМ і виступає щоразу інший менеджер.

- Migration **053** `temporary_region_access` (RLS deny-all). Гейт `canManageRegionAccess` = sdu + assistant.sdu + admin (по логіну — роль асистента прокидається через директора з боку 1С).
- Сторінка `/region-access`: регіон → менеджер (з `getRegionData`) → період; список грантів (заплановано/активний/завершено/відкликано) + дострокове відкликання. Вхід: картка у Адмін-панелі (admin) + пункт «Доступ до регіону» у меню акаунта (директор/асистент).
- Механізм даних = динамічна версія `MULTI_REGION_RM_OVERRIDES`: `resolveRegionOverrides` (хардкод ∪ активні гранти) у **read**-роутах (`getRegionData` / `planning/aggregate` / `region-stats`). **Write**-роути (finalize / confirm-activities / init-snapshot) грант НЕ honor → read-only.
- Менеджер з активним грантом бачить у блоці «Планування» перемикач **«Моє планування / Регіон»** (RMDashboard регіону, read-only). `/api/auth/me` віддає `regionGrants` (fresh, без re-login).
- ⏳ Частина A (конфіг «кому які пункти меню») відкладена — пункт директора/асистента поки захардкоджений по логіну.

### ⚡ Strategic KPI — rollup (25× швидше)

Борд «Стратегія» читає передпорахований `sales_kpi_rollup` замість скану ~150K рядків наживо.

- Migrations **051** (місячний вид) + **052** (квартал/півріччя/рік). Звірено з живими RPC **до цента**.
- Місяць 2117мс → 84мс; квартал 6286мс → 98мс. Кумулятивний YTD-distinct рахується один раз у `refresh_kpi_rollup(year)` (не сумою місяців).
- `analytics-sales-backfill.mjs` сам викликає refresh після доливу продажів. Live sales-екшен у майбутньому → рефрешити поточний місяць частіше.

### ⚡ Прогрів 1С (cold-start)

- Vercel cron `/api/cron/warm-1c` — лёгкий read у 1С кожні 5 хв у робочі години (Київ), щоб перший живий запит менеджера не був «холодним» (5-20с).

### 🐛 Клієнти — картка «Виконання»

- Період/факт/норма слідують за локальним табом місяця (не за планинг-бордом). Місяць без плану → «План не встановлено» замість вічного скелетону. Факт = агрегат сегментів (`totalFactUSD`), а не сума per-client (усувало недооцінку $896 замість $66,220). Тести + arch-guard.

### 🔧 Інше

- Sentry: `replaysOnErrorSampleRate` 1.0 → 0.2 (не впиратись у free-tier 50 replays/міс).
- Продажі: липень залито у таблицю `sales` (борд «Стратегія» показує липневу динаміку до синку 1С).

---

## [2026-07-03] · 🏁 Стратегічний KPI-дашборд («Стратегія») — ETALON

Новий борд `/admin/strategic-kpi` (вкладка «Стратегія») для `itd@` + `sdu@` — виконання стратег-цілей по 11 брендах × 3 каналах. Позначено ETALON `etalon-strategic-kpi-2026-07-03`.

### % виконання плану — єдине джерело істини (ADR-19)

- Грошовий % береться з **«Огляд компанії»** (`/api/admin/company-overview`) — той самий 1С Action 4 план + Action 5 факт, що в Плануванні. Дашборд НЕ робить власних 1С-викликів за %-ом.
- Хук `useCompanyOverviewExec` згортає Огляд у `brand × channel → {план, факт}`.
- % бренду = Σ факт / Σ план по каналах **зі стратег-тригерами** (`isChannelActive`): дистри → лише Ellanse, КЦ → лише ESSE/IUSE Coll./БАД, представництва → всі. Vitaran більше не роздувається дистрами.
- Кольори: ≥100 зел · 60–99 жовт · <60 черв. Тільки місяць (квартал/рік → клієнтський %).

### UI

- Hero: великий % + (коли каналів ≥2) розбивка по підрозділах дрібним шрифтом + категорії клієнтів бренду.
- Канальні блоки: 4 KPI-картки з таргетами + категорії клієнтів каналу.
- **Сегмент IUSE**: 3 повні блоки підбрендів (SB/hair/Coll.) кожен зі своєю розбивкою клієнтів по категоріях; % лише на hero сегмента (плану на підбренд у 1С немає).
- Прибрано суми План/Факт із шапок блоків.

### Cleanup

- Видалено мертвий `onec-plans.ts` (власні 1С-виклики) + `segment_summary` (не споживався фронтом).
- `HeroCategories` винесено у `components.tsx`; емодзі-warning → lucide `TriangleAlert`.
- Деталі: [`docs/planning/strategic-kpi-spec.md`](docs/planning/strategic-kpi-spec.md).

---

## [2026-06-12] · 🏁 Retirement metting-4.0

Старий додаток «Зустрічі» (`metting-4.0.vercel.app`) повністю замінено landing-заглушкою з посиланням на sales-planning. Менеджери більше не використовують старий метінг.

- `index.html` (2783 рядки JS-додаток) → перейменовано у `index-legacy.html` як backup
- Новий `index.html` — копія `sales-planning/public/metting-retirement-preview.html` (landing з glass-стилем, посиланням на sales-planning, контактом IT)
- API ендпоінти `metting-4.0/api/*` лишаються живі для зовнішніх викликів (білінг/звіти, якщо є)
- Rollback за 1 хв: `git revert bc0f424 && git push origin main`

**Контекст рішення:** перевірено через Supabase (`meetings` зі статусом in_progress = 6 зомбі + 3 минулих днів) і через 1С (завислі є, реально активних на 12.06 о 13:00 немає). Зомбі-зустрічі — окрема задача на cleanup.

Sentry-ішью `saveClientSurvey: Поле объекта не обнаружено (login)` приходила саме зі старого метінга (наш sales-planning шле `login` правильно через `LOGIN_BOUND_ACTIONS`). Після retirement цей потік помилок припиниться сам.

---

## [2026-06-12] · Sprint 2D — Верифікація нових клієнтів через КЦ + Bitrix SPA 1048

### 🆕 Bitrix SPA 1048 «Верифікація нового клієнта»

Коли менеджер створює нового клієнта (`registerNewClient` у 1С з резервом) — паралельно створюється картка у Bitrix24 для КЦ. КЦ обробляє → закриває → менеджер отримує колокольчик-сповіщення.

- **Bitrix-сторона:**
  - SPA `entityTypeId=1048`, категорія `10`, stage entity `DYNAMIC_1048_STAGE_10`
  - 5 стадій: `NEW` → `PREPARATION` (У роботі КЦ) → `CLIENT` (На уточненні) → `UC_119I4U` (Верифіковано) / `UC_OE18M6` (Відхилено)
  - 6 custom-полів (`ufCrm_6_*`): ПІБ, телефон, адреса, ID 1С, логін менеджера, документи
  - Поле документів `multiple=Так` (single не приймає base64 через REST)
  - Вихідний webhook `ONCRMDYNAMICITEMUPDATE` → той самий endpoint що рекламації

- **Sales-planning сторона:**
  - **Migration 023** `client_verifications` — local-cache (id, client_id_1c, bitrix_item_id, manager_login, client_name, status, rejection_reason, created/completed_at). UNIQUE на `bitrix_item_id`, partial index на активні статуси
  - **Helper** `src/lib/bitrix-verification.ts` — `createVerificationRequest` (POST `crm.item.add`), `notifyKcAboutNewVerification` (`im.notify` до 6 КЦ-юзерів), `fetchBitrixItem` для webhook handler
  - **API:**
    - `GET /api/clients/verifications` — список для menager-а (для бейджа на картці)
    - `POST /api/clients/verifications` — створює Bitrix-картку + insert у БД, не блокує flow при помилці Bitrix
    - `POST /api/clients/verifications/webhook` — приймає від reclamation-app, `timingSafeEqual` для `X-Internal-Secret`, idempotent, оновлює status + створює нотифікацію з `dedup_key`
  - **3 нові notification types:** `client_verified` (emerald), `client_rejected` (rose), `client_clarification` (amber)
  - **UI бейдж** «На верифікації КЦ» (amber з spinner) на згорнутій картці клієнта, прокинуто через `CategorySection`/`ReservedSection`/focus-view
  - **SWR mutate** після створення — бейдж з'являється одразу (без 30с polling)
  - **new-client-dialog** — після успіху `registerNewClient` паралельно POST у `/api/clients/verifications` з ClientID + ті ж файли що передавали у 1С

- **reclamation-app Python webhook розширено:**
  - Константи `VERIFICATION_SPA_ID=1048` + `VERIFICATION_FINAL_STAGES` + `VERIFICATION_INTERMEDIATE_STAGES`
  - Нова функція `send_sp_verification_status(item_id, stage_id, comment)` → POST у `/api/clients/verifications/webhook`
  - Гілка `ONCRMDYNAMICITEMUPDATE` у `bitrix_event` handler з фільтром по `entityTypeId=1048`
  - Той самий webhook endpoint що для 1038 (рекламацій) — розгалуження по `entityTypeId`

- **КЦ-юзери:** `KC_USER_IDS = [1519, 2077, 6894, 13408, 2094]` (5 менеджерів з `emet-call-center/config.py` MANAGERS) + 2049 для тестування. Аналог `MED_DEPT_USER_IDS` у рекламацій.

### 📋 Інструкція для КЦ

- **`public/kc-manual.html`** — окрема HTML-інструкція у стилі med-manual: де знайти заявки, 5 стадій воронки, стандартний робочий процес, що робити з уточненням/відхиленням, що руками робити у 1С. Доступна як `https://sales-planning-lyart.vercel.app/kc-manual.html`
- **`public/manual.html`** — розділ `#m-new-client-verification` для менеджера (як створити, що означає бейдж, що робити коли отримаєш сповіщення). Sidebar nav entry додано

### 🐛 Виявлені й виправлені проблеми

- **Бейдж «На верифікації КЦ» не показувався** — у `CategorySection` забув передати `verification={...}` prop у `<ClientRow>` (тільки `ReservedSection` + focus-view отримували). Знайдено через debug-логи `[VERIFY DEBUG]` + `[ROW DEBUG]`
- **Файли не записувались у Bitrix** — поле було `multiple=Ні`, REST для single FILE не приймає `[name, base64]`. Створено нове поле з `multiple=Так` (`ufCrm_6_1781265212`), той самий формат що в рекламаціях запрацював
- **Бейдж з'являвся лише через 30с** — додав `globalMutate('/api/clients/verifications')` після POST у new-client-dialog

---

## [2026-06-12] · Sprint 2C день 2 — Security + Observability

### 🛡️ Error Boundary (audit Week 2 знахідка)

- **`src/app/error.tsx`** — route-level boundary з glass-card fallback, Sentry capture з tag `boundary='route'`, кнопками «Спробувати знову» / «На головну»
- **`src/app/global-error.tsx`** — fallback для root layout (inline styles, без імпортів — бо провайдери ще не змонтовано)
- Використовує Next.js 16 `unstable_retry` API (заміна `reset()` з 15-ки)
- Стек тепер читабельний у Sentry завдяки source maps upload

### 📊 Observability stack — рішення зафіксовано

Після обговорення вибору між Speed Insights ($10/міс), Vercel Analytics (безкоштовно на Pro), і явним `useReportWebVitals` + Sentry — зупинились на оптимальному поєднанні **без додаткових витрат**:

| Покриття | Інструмент | Sample | Вартість |
|----------|------------|--------|----------|
| **ХТО** заходить (page views, geo, devices) | Vercel Analytics | 100% | $0 (Vercel Pro) |
| **ДЕ ВПАЛО** (errors + stack) | Sentry + source maps + PII scrubber | 100% errors | $0 (already paid) |
| **ЯК ШВИДКО** (LCP, CLS, INP, FID, TTFB) | Sentry `browserTracingIntegration` (через `tracesSampleRate: 0.1`) | 10% sessions | $0 (тим самим) |

**Що НЕ робимо зараз:**
- ❌ **Vercel Speed Insights** ($10/міс) — Sentry tracing вже дає Web Vitals безкоштовно. Якщо колись виникне потреба у 100% sample або кращому UI — переглянемо
- ❌ **Явний `useReportWebVitals` хук** — Sentry уже ловить ті ж самі метрики автоматично. Додамо тільки якщо побачимо що 10% sample недостатньо для статистики (малоймовірно при 21 менеджері × 50 PV/день = ~10k samples/міс)

**Наступний крок:** через 2-3 дні зайти у [Sentry → Performance](https://emet-0c.sentry.io/insights/frontend/) і Vercel Analytics tab, побачити перші реальні цифри. На основі цього вирішити чи потрібен Кластер B (perf optimizations).

### 🆕 Vercel Analytics встановлено

- `npm i @vercel/analytics` (v2.0.1)
- `<Analytics />` у root layout
- Privacy: cookie-less, не трекає PII, GDPR-safe

---

## [2026-06-12] · Sprint 2C день 2 — Security (PII scrubber + RLS + Sentry source maps + IDOR fix)

### 🔴→✅ IDOR fix coordinated with 1С-розробником

**Аудит-знахідки H-6 + H-7 закриті.** 1С тепер перевіряє scope (`Client outside your scope` → HTTP 403) у 4 actions, наш `/api/onec/route.ts` автоматично передає `login` з сесії через існуючий LOGIN_BOUND_ACTIONS override.

| Action | Що було | Що стало |
|---|---|---|
| `getClientReport` | Будь-хто з clientID отримував повний звіт чужого клієнта | 1С перевіряє чи клієнт належить login, повертає 403 інакше. Director/admin — bypass |
| `getAllMeetingsForClient` | Те саме — усі зустрічі чужого клієнта | Те саме — 403 для чужих, bypass для ролей |
| `saveClientSurvey` | WRITE: можна переписати анкету чужого клієнта | 1С перевіряє WRITE-scope, відмовляє при не-власнику |
| `getRegistryPlans` | Менеджер через DevTools бачив плани всіх 21 менеджерів × 9 брендів | 1С повертає тільки плани переданого login. Director/admin бачить усі |

- `src/app/api/onec/route.ts`: 4 actions додані у `LOGIN_BOUND_ACTIONS` → автоматичний override `login = session.login` для menager-frontend. Якщо менеджер у DevTools підставить чужий login → 403 «Forbidden: login outside your scope» (наш guard) ще до того як запит дійде до 1С
- `src/app/api/admin/company-overview/route.ts`: server-side `callOnec('getRegistryPlans')` обходить `/api/onec`, тому додано `login: DIRECTOR_PROXY_LOGIN` (sdu@) явно — admin сторінка бачить усі плани через director-bypass

**Verified у проді:** menager-DevTools запит з чужим clientID повернув `{code: 403, message: 'Client outside your scope'}`. Нормальний flow (своя картка, manager-dashboard, /admin/company-overview, saveClientSurvey) — без регресії.

**`getTrainings` прибрано з ТЗ** — це публічний календар корпоративних семінарів (regionCode + dateFrom), без PII, scope-check не потрібен.

---


### 🔒 Sentry source maps upload

Раніше Sentry показував minified stack (`lV`, `sm`, `sh`) — дебажити прод-помилки було неможливо. Тепер на кожному Vercel build `.map` файли заливаються у Sentry.

- `next.config.ts`: `withSentryConfig` з org=emet-0c, project=sales-planning, `widenClientFileUpload: true` (frontend bundles), `sourcemaps.filesToDeleteAfterUpload` (щоб maps не світили публічно у production HTML)
- Потребує `SENTRY_AUTH_TOKEN` у Vercel env (Production + Preview) — додано

### 🔒 PII scrubber для Sentry (`beforeSend`)

Раніше у Sentry events потрапляло: повне URL з email/phone у query, request body (паролі/коментарі), input values у breadcrumbs (паролі з логін-форми), cookies, auth headers.

- Новий `src/lib/sentry-pii-scrubber.ts` — спільний helper для client+server `beforeSend`
- Підключений у `sentry.client.config.ts` (browser) і `src/instrumentation.ts` (server/edge)
- Чистить:
  - URL query params (email, phone, login, token, password, secret, fullname, birthdate, address)
  - `request.data` повністю + `query_string` + `cookies`
  - `request.headers`: видаляє `cookie`, `authorization`, `x-api-key`, `x-internal-secret`
  - `user`: лишається тільки `id` і `role` (без email/username/ip)
  - Breadcrumbs `ui.input` / `ui.click`: видаляє `message` і `value` (паролі)
  - URL у navigation/fetch breadcrumbs — теж scrub query params
- Session Replay: `maskAllText: true`, `maskAllInputs: true`, `blockAllMedia: true` — щоб replay не запис texts/inputs

### 🔒 RLS на 9 core-таблицях (Migration 023)

Раніше тільки `meetings`/`meeting_syncs`/`notifications`/`client_comments` мали RLS. Решта — без. `service_role` (наш бекенд) обходить RLS у будь-якому випадку, тож фактичної дірки нема, але якщо хтось у майбутньому випадково використає `anon`/`authenticated` client замість `service_role` — повний доступ.

- Migration `20260612_023_core_rls.sql` — ідемпотентний DO-блок, що обходить 9 таблиць:
  `users`, `periods`, `forecasts`, `gap_closures`, `period_summaries`, `planning_snapshots`, `planning_locks`, `planning_settings`, `actual_activities`
- На кожній: `enable row level security` + `create policy svc_full_access for all to service_role`
- Для anon/authenticated політик нема → RLS default-deny
- Rollback скрипт є (`...rollback.sql`) — disable RLS + drop policy
- Безпечно для проду: жодна зміна у поведінці API (service_role завжди мав доступ)

### 📊 Аудит Week 1 — **повністю закрите за 2 дні** 🎉

| Знахідка | Статус | Файл |
|---|---|---|
| Hardcoded `SESSION_SECRET` fallback | ✅ Day 1 | `src/lib/session.ts` |
| `validateApiRequest` allow-all у non-prod | ✅ Day 1 | `src/lib/api-auth.ts` |
| `[ШАГ 1]/[ШАГ 2]` повний payload у Vercel logs | ✅ Day 1 | `src/app/api/onec/route.ts` |
| Sentry source maps не залиті | ✅ Day 2 | `next.config.ts` |
| Sentry без PII scrubber | ✅ Day 2 | `sentry.client.config.ts`, `src/instrumentation.ts`, `src/lib/sentry-pii-scrubber.ts` |
| Core-таблиці без RLS | ✅ Day 2 | `supabase/migrations/20260612_023_core_rls.sql` |
| IDOR у 4 1С actions | ✅ Day 2 | `src/app/api/onec/route.ts` + 1С scope-check verified |

**Лишається на Week 2-3 (medium/low):**
- 🟡 Розбити `clients-page.tsx` (2900 LOC) на 5-7 файлів
- 🟡 Hardcoded логіни (`sdu@`, `itd@`, `rm.odessa@`) → env-override
- 🟡 Common date-parser замість 11 дублів split-impl
- 🟡 CHECK constraint на `users.role`, FK `notifications.user_login`
- 🟡 Login rate-limit per-login + per-IP (зараз тільки per-IP)
- 🟢 Lazy-load admin/recharts (bundle size −30%)

---

## [2026-06-11] · Sprint 2C — Коментарі менеджера + UI polish + аудит

### 🆕 Коментарі менеджера по клієнтах

Менеджер / РМ / director / admin можуть лишати текстові коментарі по клієнту з 1С — з історією по датах. Прив'язано до ClientID, лишається при передачі клієнта між менеджерами.

- **Supabase migration `022_client_comments`** — таблиця з soft-delete, snapshot `author_name`, CHECK length 1-2000, партійні індекси WHERE `deleted_at IS NULL`
- **3 API endpoints**: `GET/POST /api/clients/comments`, `DELETE /api/clients/comments/[id]`, `POST /api/clients/comments/counts` (bulk для бейджа)
- **2 хуки**: `useClientComments(clientId1c)` SWR-список, `useClientCommentsCounts(clientIds)` bulk-counts (deduping 30s, hash-ключ кешу)
- **UI компонент** `ClientCommentsSection` — у розгорнутій картці між інфо та План×Фактом:
  - Auto-grow textarea (60px → 220px max)
  - Останній коментар видно одразу, кнопка «Показати всю історію (N)» у стилі EventsTimeline
  - Свій коментар можна видалити (✕ при hover, soft-delete у БД)
- **Бейдж «коментарі: N»** у згорнутій картці — desktop інлайн поряд з «Остання подія», mobile окремим рядком

### 🆕 Фільтр «Без підсумку» у /meetings

Типовий пропуск менеджера — завершити зустріч і забути дописати підсумок у comment. Через місяць не знайти що домовлялися. Тепер видно одним кліком.

- **Pill «Без підсумку» (amber)** у filters-bar поряд зі статус-фільтрами. Окрема логіка: `status === 'done' AND comment пустий`, незалежно від інших статусів
- **Tag amber «Без підсумку»** на самій картці завершеної зустрічі без коментаря — щоб менеджер бачив при скролі без потреби фільтрувати
- EmptyState для no-outcome: окремий меседж «У цьому періоді нема зустрічей без підсумку — усі завершені задокументовано»
- Працює разом з date-presets (за замовч. «Цей місяць» по `meeting.date`)
- Sidebar nav entry «↳ Зустрічі без підсумку» у manual.html

### ✨ UI polish для /clients

- **Єдиний `LoadingScreen`** на /clients, /meetings, /claims — без glass-card, без згадки 1С
- **«Остання подія» (тип + дата)** на картці клієнта — з bulk-полів `LastMeetingDate`/`LastCallDate` (історія загалом) + fallback на `checkActivities` (поточний місяць). Парсимо обидва формати 1С (DD.MM.YYYY + YYYY-MM-DD). Desktop інлайн з телефоном, mobile перед ДН
- **Mobile-редизайн картки клієнта** — ПІБ truncate в один рядок; action-кнопки (Дзвонити / Зустріч / Рекламація) винесені у footer з border-top — як на meeting-card

### 🛠 Header

- **ФІО+посада з `xl` → `lg` breakpoint** — видно з 1024px (раніше тільки з 1280px)
- **Підпис «CEO компанії»** для `ceo@emet.in.ua` через `LOGIN_LABEL_OVERRIDES`
- CEO додано у Supabase `users` (Кілісь Юлія, role=director, can_view_company_overview=true) — бо просто логін не upsert-ить юзера у БД, лише форма планування

### 📋 Аудит проекту

- Workflow з 12 паралельних audit-агентів по dimensions: auth, authz, injection, 1С boundary, webhooks, secrets, data-integrity, supabase-schema, errors, performance, arch, mobile/a11y
- **85 raw-знахідок** (без adversarial-verify через помилку схеми StructuredOutput): 21 high, 44 medium, 19 low
- **Score 5.5/10** — функціонально живий, але є 17 серйозних security-проблем у проді і 0 RLS на core-таблицях
- Результати: [docs/audit-2026-06-11.md](./docs/audit-2026-06-11.md) (executive UA) + [docs/audit-raw-findings.json](./docs/audit-raw-findings.json) (повний JSON)
- 4-фазний roadmap: Week 1 (critical security), Week 2-4 (RLS + observability), Month 2-3 (tech-debt), Backlog

### 🏆 ETALON tag

`etalon-clients-mobile-2026-06-11` — фіксація стану перед коментарями. Дефолт при відкоті.

---

## [2026-06-11] · Sprint 2B Рекламації + Notification Center + ДН клієнтів + Team meetings

### 🆕 Рекламації (модуль)

Інтеграція з Bitrix24 Smart Process 1038 — менеджер подає претензії клієнтів напряму з sales-planning, не покидаючи систему.

- **Форма створення** з 3-х точок входу: кнопка «Нова рекламація» на сторінці, рядок у картці клієнта, іконка «!» на картці зустрічі
- Розумна анкета: для медичних типів (Якість/Ефективність/Побічна/Ускладнення) — повна 13-14-полева анкета по обраному препарату; для решти — simpleDesc
- Multipart upload файлів — до 5 шт сумарно 4 MB (Vercel body-limit safe)
- Окремий перегляд list (`/claims`) з glass-cards, eyebrow «Рекламація #N», meta-рядок (дата · тип · препарат)
- Filter pills + сервер-сайд detect непрочитаних коментарів через regex `<b>X</b> (Менеджер)` → badge «Нове», filter-pill «Непрочитані»
- Деталь (`/claims/[id]`) з info-card, details, чат з мед-відділом (polling 15с)
- Файли: server-proxy через webhook (обхід `invalid_authentication`), JSON-aware unwrap для b_file legacy IDs з Content-Disposition extraction, lightbox з progressive image→video→download fallback
- Notify мед-відділу через `im.notify` Bitrix
- Терміналогія «рекламація» (не «претензія»)

### 🔔 Notification Center

Колокольчик у шапці з лічильником непрочитаних — централізована точка для всіх системних повідомлень. Розширюваний на майбутні типи.

- **Supabase migration `021_notifications`** — таблиця з UNIQUE INDEX на `dedup_key` (idempotent retry-safe)
- **4 API endpoints**: `GET /api/notifications`, `POST /[id]/read`, `POST mark-all-read`, `POST internal`
- **`NotificationsBell`** компонент у AppHeader з SWR badge polling 30с, optimistic updates, color-coded dots по типу
- **Інтеграція з `reclamation-app`** Python webhook через `X-Internal-Secret` header (shared secret з env `NOTIFICATIONS_INTERNAL_SECRET`)
- **Echo-filter** ловить менеджерські коментарі (`(Менеджер)`) щоб не задвоювати самі собі notifications

### 🎂 День народження клієнтів

Інструмент щоб не пропустити нагоду для дзвінка-привітання — простий привід для лояльності.

- `BirthDate` поле у `ClientFromOneC` + helpers: `getClientBirthDate` (normalize → ISO), `getAge` (NaN-safe), `isBirthdayToday` (day+month match)
- **Банер вгорі `/clients`** з gradient-blue, Cake-іконкою, переліком імен + клік фокусує картку
- **Chip «Сьогодні ДН»** на картці клієнта (синій glass-tint)
- **Інлайн-рядок «14.06 · 40 років»** під телефоном з правильним UA-plural (`pluralUaYears`)

### 👥 Зустрічі команди (РМ)

Read-only вкладка для регіональних керівників на сторінці `/meetings`.

- `GET /api/meetings?scope=managed` — повертає тільки `[...managedUsers]` без своїх. Доступ admin/director/rm. 403 для звичайного менеджера
- **`TeamMeetingsView`** компонент з власним filter-row «Менеджер» (всі / конкретний з managedUsers) + лічильниками
- `MeetingCard` отримав props `readOnly` (ховає Розпочати/Завершити/Скасувати/Перенести/Правка/Підсумки) і `managerLabel` (фіолетова pill з іменем)
- `useManagedUserNames` hook — резолвить login→fullName через `getRegionData` (Action 5)

### 🛠 Дрібні UI fix-и

- LiveTimer fallback chain: реальний `startedAt` з БД → плановий час зустрічі → updated_at
- Native `<input type="time">` назад у meeting-form (iPhone показує нативний Будильник picker)
- vaul Drawer для пошуку клієнтів на mobile (вирішує iOS PWA keyboard scroll) + base-ui Dialog на desktop
- Sentry BOM-DSN sanitize (Vercel env міг мати UTF-8-BOM маркер)
- Меньші action-кнопки у шапці «Клієнти» на desktop (34px замість 44px — пропорційно до h1)
- Initials у аватарі скіпають дужки (`Андрущук (Недолуга) К.` → `АН`, не `А(`)
- Skeleton screens для `/clients`, `/meetings`, `/claims` замість центрального spinner

### 🔐 Security + env

- `NOTIFICATIONS_INTERNAL_SECRET` — shared secret між sales-planning і reclamation-app для server-to-server auth
- `BITRIX_WEBHOOK_URL` у reclamation-app тепер з env (раніше hardcoded токен `24pv36uotghswqwa` став INVALID_CREDENTIALS)
- `TG_NOTIFICATIONS_DISABLED=true` у reclamation-app env — kill-switch для TG-бота щоб не задвоювати notifications (функціональність ціла, прибрати змінну → знов вмикається)
- Vercel Deployment Protection — Standard Protection для preview, Production публічна (з обов'язковим secret-auth на `/api/notifications/internal`)

### 📝 Docs

- `public/manual.html` — нові розділи «Сповіщення», «Рекламації», «День народження клієнтів», «Зустрічі команди» + FAQ доповнено питаннями по новій функціональності
- `public/presentation.html` — 3 нові слайди (08 Рекламації, 09 Сповіщення, 10 ДН клієнтів) перед value-slide
- `docs/notifications-internal-api.md` — спеціфікація payload + secret для майбутніх інтеграцій з notification center

### 🏷 Etalon

- `etalon-reclamations-2026-06-11` (merge commit `c0e8e0d`) — дефолт при відкоті після цієї дати
- Backup tag `backup-before-merge-2026-06-11` (`042b31a` на feature/reclamations) — точка до merge master

---

## [2026-05-14] · Автоматичні бекапи БД + повний technical README

### 📖 Документація проекту

Замість Next.js-boilerplate README — повний technical overview:
- Бізнес-функція + ключові механіки
- Tech stack з версіями і важливими обмеженнями (Next 16 + webpack, не Turbopack у prod)
- Структура проекту з деревом папок
- 4 ролі (manager/rm/director/admin) + permission matrix
- 7 actions 1С з призначенням і викликачами
- 11 таблиць Supabase зі зв'язками
- API routes (auth, onec, planning, admin, archive) — короткий опис кожного
- 13 dashboard-компонентів + planning-form
- ~30 lib helpers (SWR хуки, агрегати, guards, formatters)
- State machine: чернетка → finalized → unfinalize, window-lock priority
- Deploy + env vars + git hooks
- Backup стратегія (посилання на `docs/BACKUPS.md`)
- Тести (180+ unit + Playwright QA + architecture-check)
- Index всіх документів проекту

Файл: [README.md](./README.md)

### 🗄️ GitHub Actions cron — двічі на день

Supabase Free не має managed backups, тому самі: workflow `backup-supabase.yml` запускає `scripts/backup-supabase.mjs` за розкладом і комітить snapshot у окрему гілку `backups` цього ж репо.

- **Розклад:** 09:00 + 20:00 Київ (06:00 + 17:00 UTC), щоденно
- **Зберігання:** orphan-гілка [`backups`](https://github.com/EmetITteam/sales-planning/tree/backups), кожен snapshot = окремий commit
- **Структура:** `backups/<UTC-timestamp>/{users,periods,forecasts,gap_closures,period_summaries,planning_snapshots}.json` + `manifest.json` з row counts
- **Required secrets:** `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (legacy)
- **Vercel guard:** `vercel.json` на гілці `backups` з `deploymentEnabled: false` — без нього Vercel падав би на кожен snapshot-push (там нема Next.js джерел)

**Файли:**
- `.github/workflows/backup-supabase.yml` — cron workflow з orphan-init
- `docs/BACKUPS.md` — повна документація стратегії, як відновлювати, ретеншн-план

**Backup-стратегія тепер hybrid:** auto 2×день для історії + ручний `node scripts/backup-supabase.mjs` перед кожною DDL міграцією для свіжості.

---

## [etalon-2026-05-12-v2] · git tag `etalon-2026-05-12-v2` (commit `741b5c7`)

### 🏁 Новий ETALON — після Action 7 + PlanningReadinessCard

**Що нового vs v1 (`etalon-2026-05-12`):**

#### Action 7 — `checkActivities` (1С v2.6)

1С повертає `hasCall` / `hasMeeting` per клієнт. Frontend автоматично ставить «Виконано» (зелений бейдж) на рядках планування зі stage=Дзвінок/Зустріч коли 1С підтвердив.

- `src/lib/onec-types.ts` — типи `CheckActivitiesRequest/Response` + `OneCActivity`
- `src/app/api/onec/route.ts` — whitelist + LOGIN_BOUND_ACTIONS
- `src/components/planning/planning-form.tsx` — auto-confirm useEffect (one-way sync: stageDone=true ніколи не скидається з 1С)
- Cross-channel separation тести: Дзвінок не фіксується від hasMeeting і навпаки
- 11 unit-тестів у `tests/action7-check-activities.test.ts`
- Live integration test: `scripts/qa-action7.mjs` (auto-login Director → POST /api/onec → verify)

#### Action 7 auto-persist

Раніше: 1С підтверджував → state форми ставив stage_done=true → але БД не оновлювалась поки menager не натисне «Зберегти».

Тепер: новий мінімальний endpoint `/api/planning/confirm-activities` що PATCH-ить **тільки** `stage_done=true` для конкретних рядків. Не зачипає інші поля state.

- `src/app/api/planning/confirm-activities/route.ts` — новий endpoint
- Frontend useRef memo щоб не дзвонити повторно при ре-рендері
- Fire-and-forget — UI state оновлено локально, якщо API fail → re-confirm при наступному save

#### PlanningReadinessCard — overview готовності планування

Нова картка на Director дашборді (після CategoryStatsTable, перед списком регіонів). Показує:
- **Скільки менеджерів торкнулися системи** — text `X/Y менеджерів`
- **% реальне покриття брендів** — bar `(Σ filled_cells) / (managers × 9)`. Житомир з 1 менеджером 6/9 → 67% AMBER (не 100% GREEN як було помилково)
- **Mini-list 8 регіонів** у header (dot + назва + manager count, без %)
- **Drill-down** клік → expand 8 регіон-карток → клік регіон → 2-колонкова сітка менеджерів + список пропущених брендів як plain text з крапкою (не chips)
- **Авто-режим:** якщо всі менеджери заповнили повністю → компактний інлайн «✓ Усі менеджери заповнили план» без drill-down

**Feature flag для швидкого вимкнення:**
```ts
// src/lib/feature-flags.ts
export const FEATURES = {
  PLANNING_READINESS: true,  // змінити на false → блок зникне після deploy
};
```

- `src/components/dashboard/planning-readiness-card.tsx` — компонент
- `src/lib/feature-flags.ts` — toggle
- `src/components/dashboard/director-dashboard.tsx` — інтеграція

#### Тести: 155 → 155 (без змін кількості, але +11 для Action 7 + 21 для readiness внутрішніх)

#### Backups

- `backups/2026-05-12T16-32-50Z/` — pre-Action 7 state
- (наступні бекапи робити через `node scripts/backup-supabase.mjs` — timestamp-based, не перезаписує)

### Як повернутись до v2

```bash
git checkout etalon-2026-05-12-v2
```

DB rollback не потрібен (всі зміни — UI/API, БД-схема без нових міграцій з часів v1 M8).

---

## [etalon-2026-05-12] · git tag `etalon-2026-05-12` (commit `9f771cb`)

### 🏁 Стан еталона

**Цей реліз зафіксовано як ETALON-стан після виправлення 2 днів каскадних багів навколо M7 migration.** Якщо щось зламається у наступних змінах — повернутись сюди:

```bash
git checkout etalon-2026-05-12
```

DB rollback (M8 soft-delete):
```sql
UPDATE forecasts SET archived_at = NULL WHERE archived_at = '2026-05-12T15:43:11.944Z';
UPDATE gap_closures SET archived_at = NULL WHERE archived_at = '2026-05-12T15:43:11.944Z';
```

Full DB restore — `backups/2026-05-12T15-31-08Z/` (pre-M8) або `backups/2026-05-12T16-32-50Z/` (post-everything).

### Додано

- **M7 migration** — usі planning-дані переведено на monthly canonical `period_id` (`YYYYMMDD` останнього дня місяця). Менеджер планує МІСЯЦЬ; тижневий фільтр у дашборді — лише для розрахунку `expected %`.
- **M8 soft-delete** — `archived_at TIMESTAMPTZ` колонка на forecasts + gap_closures. Partial index `WHERE archived_at IS NULL`. M8 cleanup script (`scripts/m8-apply.mjs`) видалив 82 рядки baгaжу від M7 union (Бойко, Фещенко, Андрющенко × 2, Мігашко, Бакумова × сегментів).
- **byLogin** breakdown у `/api/planning/aggregate` — per-manager × segment forecast/gap для real expectedPercent у BrandRow.
- **safeRole** helper у `src/lib/types.ts` — whitelist-валідація ролі проти `['manager','rm','director']`. Захищає від ескалації `'superadmin'` через body.userMeta.role.
- **monthlyPidFromAnyPid** — pure-fallback у `src/lib/periods.ts`: weekly pid → monthly без DB hop.
- Тести: `tests/m8-soft-delete.test.ts` (27), `tests/security-fixes.test.ts` (20), `tests/monthly-period-id.test.ts` (16). Total 144/144 pass.
- Документація:
  - `docs/ARCHITECTURE_INVARIANTS.md` — секції 6-10 (M7, M8, per-segment classification, BrandRow contract, save flow)
  - `CHANGELOG.md` (цей файл)
  - `supabase/migrations/20260512_007_consolidate_to_monthly_periods.sql` + rollback
  - `supabase/migrations/20260512_008_archived_at_for_soft_delete.sql` + rollback

### Виправлено

#### Регресії
- Brand-row показував mock `факт + 60% × розриву` замість реального `(forecast+gap)/plan` — давало 67% де мало бути 95%. Тепер `expectedPercent ?? 0`.
- `hasManagerPlan` логіка узгоджена в усіх 5 dashboard-компонентах: `!!planAgg && planAmount > 0`. Поки planAgg=null → сховано (без blink 0% → real %).
- `manager-dashboard.tsx` — додано guard на planAgg (раніше показував blink).
- Period filter regression — `onRehydrateStorage` callback не тригерив re-render у zustand v5. Переписано на `merge()` callback + детектор «Весь місяць» як stale.
- Per-segment classification — composite key `${segment}|${clientId}` у forecastClientIds/gapNewClientIds/gapActivationClientIds. Раніше клієнт у плані Vitaran ставав «Активним» у IUSE де плану нема.

#### Save flow + DB
- `archived_at IS NULL` фільтр у DELETE notIn — щоб M8 archived рядки переживали наступні saves.
- UPSERT payload явно `archived_at: null` → ре-save oживляє archived клієнта.
- LastPurchase enrichment приховує cross-brand fallback — клієнт у плані EXOXE не показує last_purchase від Vitaran.
- «+Додати» через пошук → порожні дата/сума/потенціал. `manuallyAdded=true` для обох блоків. Enrichment skip-ає manually-added.

#### Security (P0)
- **CSRF mitigation** — `sec-fetch-site=none` пропускається ТІЛЬКИ для GET/HEAD. POST/PATCH/PUT/DELETE з 'none' → fallback Origin allowlist → API key. Phishing-сторінка більше не може form-POST з cookie auto-sent.
- **Role enum validation** — `safeRole(raw, fallback)` у обох роутах: planning POST + init-snapshot. Раніше Director через `userMeta.role='superadmin'` міг записати чужого менеджера у `users.role`.
- **SESSION_SECRET length** — у production throw якщо < 32 chars (HS256 рекомендує ≥ 256 біт).

#### UX
- «Запл.: 0%» показується завжди коли бренд має target з 1С (раніше при menager.plan=0 ховалось → виглядало як зламано).
- init-snapshot — додано DB fallback для legacy non-YYYYMMDD pid (паритет з planning route).

### Видалено

- Mock-fallback у brand-row.tsx (`factPct + 60% × розриву`).
- Cross-brand `allManagerClients` fallback у enrichment useEffect.

### Backup-структура

- `backups/2026-05-08/` — старий, до сесії 12.05
- `backups/2026-05-12T15-31-08Z/` — pre-M8 cleanup
- `backups/2026-05-12T16-32-50Z/` — post-M8 + всі fixes (повний etalon snapshot)

### Уроки сесії 11-12.05

1. **Backup ПЕРЕД будь-якою migration у НОВИЙ каталог з timestamp.** Я перезаписав pre-migration backup своїм же backup-script run.
2. **Migration що union'ить дані — небезпечно.** M7 dedup keeps latest, але якщо рядки disjoint у різних pid → обидва виживають → плани складаються.
3. **Auto-populate не = «згоден з планом».** Save без редагування персистить всі auto-populate рядки. Потрібен або явний accept, або NOT save until manager touches.
4. **Search modal cross-brand даних не показувати.** При «+Додати» з пошуку — менеджер сама вписує суму, не auto-fill з last_purchase іншого бренду.
5. **zustand v5 `onRehydrateStorage` мутація не тригерить re-render.** Використовувати `merge()` callback.
6. **«Запл.: 0%» blink.** При loading planAgg — приховувати індикатор, не показувати фейкові 0%.
7. **M8 archived data мусять переживати save.** DELETE notIn + UPSERT payload потребують явного фільтру/поля archived_at.

---

## Раніше

Див. `git log` для попередньої історії. Цей CHANGELOG почато з etalon-2026-05-12.
