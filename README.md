# Sales Planning (Планування продажів) — EMET

Внутрішня веб-система компанії EMET для **щомісячного планування продажів менеджерів** з інтеграцією у 1С Підприємство та трирівневою ієрархією контролю (Менеджер → РМ → Директор).

> 📚 **Швидкий старт:** `npm install && npm run dev` → [http://localhost:3000](http://localhost:3000)
> 🚀 **Production:** [sales-planning.vercel.app](https://sales-planning.vercel.app) (auto-deploy з гілки `master`)
> 📖 **Інструкція для користувачів:** [public/manual.html](./public/manual.html)
> 🎯 **Презентація для команди:** [public/presentation.html](./public/presentation.html)

---

## Зміст

1. [Що робить система](#1-що-робить-система)
2. [Tech stack](#2-tech-stack)
3. [Структура проекту](#3-структура-проекту)
4. [Ролі та доступи](#4-ролі-та-доступи)
5. [Архітектура взаємодії](#5-архітектура-взаємодії)
6. [Інтеграція з 1С (13 actions)](#6-інтеграція-з-1с-13-actions)
7. [Схема БД (Supabase)](#7-схема-бд-supabase)
8. [API routes](#8-api-routes)
9. [Frontend компоненти](#9-frontend-компоненти)
10. [Lib helpers](#10-lib-helpers)
11. [State machine планування](#11-state-machine-планування)
12. [Deploy і environment](#12-deploy-і-environment)
13. [Backups і відновлення](#13-backups-і-відновлення)
14. [Тести і QA](#14-тести-і-qa)
15. [Документація](#15-документація)

---

## 1. Що робить система

### Бізнес-функція

Система виросла з інструмента місячного планування у **операційну платформу відділу продажів** із **семи модулів**:

**1. Планування (прогноз + розрив)** — менеджери щомісяця планують:
- **Прогноз** — кого з активних клієнтів обзвонять/зустрінуться для повторної покупки + орієнтовна сума
- **Закриття розриву** — кого «розбудять» (сплячі клієнти, які купували > 3 місяці тому) щоб закрити різницю між планом 1С і прогнозом
- **Дії по розриву** — текст «що робитимуть» (gap_action_1/2/3)

**2. CRM «Мої клієнти»** (`/clients`) — щоденний робочий інструмент менеджера (не лише раз на місяць): уся клієнтська база по категоріях, пошук, план×факт по брендах, 6-міс історія покупок, план активації з 1С, контактна активність, події, **день народження клієнтів** (банер + chip, з 2026-06). Менеджер відкриває картку клієнта перед/під час дзвінка.

**3. Зустрічі (Sprint 1.5, 2026-06)** (`/meetings`) — **операційний модуль** для планування і проведення зустрічей з клієнтами. Замінює окремий застосунок «СРМ Зустрічі»:
- Створення / перенесення / скасування зустрічі (синхронний write у 1С — без race conditions, без дублів)
- Розпочати / завершити зустріч з геолокацією (start/end address + GPS, fallback на manual)
- Анкета клієнта при завершенні (структура з 1С Survey-схеми)
- Фільтри по даті (today / week / month / custom) і статусу — широкий діапазон робить SYNCHRONOUS bulk-import з 1С `getInitialData`
- БД як read-кеш, 1С — source of truth. Mutations синхронно до 1С (як у meeting-app)

**4. Операційний огляд** — РМ і Директор бачать агрегацію по своїй ієрархії (регіон/менеджер/бренд) з кольоровою індикацією виконання й готовності планування; admin/директор — окремий дашборд **«Огляд компанії»** по всіх підрозділах (включно з не-планувальними). РМ додатково має **вкладку «Зустрічі команди»** (read-only перегляд зустрічей підлеглих з фільтром по менеджеру, з 2026-06).

**5. Рекламації (Sprint 2B, 2026-06)** (`/claims`) — модуль претензій клієнтів інтегрований з Bitrix24 SPA 1038. Менеджер подає рекламацію на якість препарату/упаковки з прикріпленими фото/відео, мед-відділ відповідає у чаті всередині sales-planning. Замінює окремий застосунок «reclamation-app». Файли тягнуться через server-proxy (обхід Bitrix-сесії). Filter «Непрочитані» + badge «Нове» на картці = server-side detect через regex на текст останнього коментаря.

**6. Notification Center (2026-06)** — колокольчик у шапці з лічильником непрочитаних, dropdown зі списком. Поточно показує тільки нові коментарі мед-відділу у рекламаціях, розширюваний на майбутнє (нагадування зустрічей, ДН клієнтів, системні події). Інтегрований з `reclamation-app` Python webhook через shared secret.

**7. Стратегічний KPI «Стратегія» (2026-07)** (`/admin/strategic-kpi`, вкладка «Стратегія») — дашборд виконання стратег-цілей по 11 брендах × 3 каналах (представництва / колл-центр / дистриб'ютори) для `itd@` (admin) + `sdu@` (директор). Грошовий **% виконання плану береться з «Огляд компанії»** (той самий 1С Action 4 план + Action 5 факт, що в Плануванні — єдине джерело істини, ADR-19), рахується лише по каналах зі стратег-тригерами (`isChannelActive`). Hero з розбивкою по підрозділах + категорії клієнтів; сегмент IUSE — 3 повні блоки підбрендів. Деталі: [docs/planning/strategic-kpi-spec.md](./docs/planning/strategic-kpi-spec.md).

### Ключові механіки

- **Жорстке finalize** — менеджер фіксує план («Фінальне збереження») і далі може правити тільки коментарі по етапах. РМ/Director бачать на dashboard у скільки людей план уже фінальний.
- **Розфіналізація — per-user permission** (M10, 2026-06-08). Раніше тільки admin міг розфіналізувати. Тепер через `users.can_unfinalize_plans=true` (UI у `/admin/unfinalize-permissions`) admin може передати таку можливість конкретному юзеру (асистент директора, керівник).
- **Активність по бренду = 3 місяці**, а не 1С-категорія. Клієнт «активний по Petaran» якщо купував Petaran за останні 90 днів — інакше йде у Gap.
- **Window-lock** — Director керує вікном планування: глобальний lock на період, або per-user allow/block override.
- **One-way activity sync** з 1С — Action 7 повертає `hasCall`/`hasMeeting` per клієнта → frontend автоматично ставить `stage_done=true` (але назад не скидає).
- **Snapshot fixation** — при першому збереженні плану `planning_snapshots` записує список клієнтів навіки, щоб історичні «незаплановані» не зникали при правках.
- **Auto-reload guard для cold-start 1С** (2026-06-08) — якщо `getRegistryPlans` повертає пустий список через 30с після mount /clients, system робить одноразовий `window.location.reload()` (sessionStorage flag блокує loop). Це покриває рідкісну ситуацію коли 1С handler застряг у холодному стані.

### Дизайн (2026-05, glass-реліз)

Повний glass-morphism редизайн усіх дашбордів: напівпрозорі картки з ambient-glow за станом (зелений/помаранчевий/червоний), EMET-лого (#081E2D), уніфікована мова кольорів, фавікон/PWA-іконка зі знаком EMET. Тег-еталон `etalon-glass-prod-2026-05-29`.

### Sprint 1.5 — Meetings module (2026-06-08)

Sprint 1.5 додав модуль зустрічей у production. Архітектурні рішення:

| Аспект | Рішення | Чому |
|---|---|---|
| READ flow | БД як кеш + `getInitialData` з 1С при кожному запиті | Source of truth = 1С, БД для швидкого SELECT по власних UUID |
| WRITE flow (create/start/finish/update/cancel) | **Синхронний** виклик 1С → потім UPDATE БД | Buffer-pattern спершу спробували (Sprint 1.5.3) — створював дублі через race condition cron-failure. Переписано на sync-mode (як meeting-app) — 0 дублів |
| Wide-filter bulk-import | Sync if range > 2 days, background if ≤2 days | Юзер чекає на 1С для тижня/місяця (5-15с разово), але миттєвий рендер для today |
| Buffer queue (`meeting_syncs`) | Лишилась у БД для майбутніх arch-ітерацій, але неактивна | Cron-worker tick'ає no-op. Sprint 2 повернеться до idempotent buffer коли 1С підтримуватиме що saveNewMeeting не дублює |
| Geo | navigator.geolocation + manual fallback | Браузер blocks → manual ввід адреси з прапором `geo_manual=true` |
| Sentry | @sentry/nextjs v10 + tunnel `/monitoring` | Error tracking у проді |

Migrations 013-020: meetings/meeting_syncs schema + legacy_1c_id + client snapshot + RLS safety net + started_at/finished_at + anketa_data_json + can_unfinalize_plans.

### Sprint 2B — Reclamations + Notification Center (2026-06-11)

Sprint 2B додав модуль рекламацій та централізований колокольчик-сповіщення. Архітектурні рішення:

| Аспект | Рішення | Чому |
|---|---|---|
| Reclamation storage | Bitrix24 SPA 1038 (Smart Process) | Master-data залишається у Bitrix, sales-planning як UI-shell. Не дублюємо у Supabase щоб уникнути sync-проблем. |
| Reclamation files | Bitrix Disk + server-proxy | Bitrix URL потребує сесію (cookie). Для menag-users без Bitrix-акаунта → наш proxy fetches через webhook token, стрімить байти. JSON-aware unwrap для `crm.controller.item.getFile` (повертає base64-обгортку). |
| Chat unread detect | Server-side regex на тексті останнього коментаря | `<b>FullName</b> (Менеджер)` — менеджерські коментарі. Регex швидше ніж зберігати `read_at` per-message у БД для невеликих обʼємів. |
| Notification storage | Supabase `notifications` table з UNIQUE INDEX на `dedup_key` | INSERT idempotent при webhook retry. dedup_key типу `bitrix:claim:12:comment:9876`. |
| External-to-internal flow | shared secret у header `X-Internal-Secret` | reclamation-app Python webhook → POST на `/api/notifications/internal`. Не потребує JWT cookie бо це server-to-server. |
| TG bot during transition | env-flag `TG_NOTIFICATIONS_DISABLED=true` | Поки menag-users звикають до колокольчика — TG вимкнено щоб не задвоювати. Функціонал ціла, прибрати env → знов вмикається. |

Migration 021: notifications table з RLS (service_role bypass) + UNIQUE INDEX на dedup_key.

### Sprint 2B follow-ups (2026-06-11)

Точкові поліпшення вже після релізу Sprint 2B:

| Зміна | Файли | Чому |
|---|---|---|
| Єдиний `LoadingScreen` на /clients, /meetings, /claims | `src/components/ui/loading-screen.tsx` | Замість 3 різних skeleton-ів — лаконічний spinner+текст, без glass-card і згадки 1С. |
| «Остання подія» (тип + дата) на картці клієнта | `src/components/clients/clients-page.tsx` | З bulk-полів `LastMeetingDate`/`LastCallDate` (історія загалом) + fallback на `checkActivities` (поточний місяць). Парсимо обидва формати 1С (DD.MM.YYYY + YYYY-MM-DD). Desktop інлайн у рядку з телефоном, mobile окремим рядком перед ДН. |
| Mobile-редизайн картки клієнта | `src/components/clients/clients-page.tsx` | ПІБ truncate в один рядок; action-кнопки (Дзвонити / Зустріч / Рекламація) винесені у footer з border-top — як на meeting-card. |
| ФІО+посада у header з `xl` → `lg` breakpoint | `src/components/layout/app-header.tsx` | Видно з 1024px (раніше тільки з 1280px). |
| Підпис «CEO компанії» для `ceo@emet.in.ua` | `src/components/layout/app-header.tsx` | Через `LOGIN_LABEL_OVERRIDES` (як для owner@ / assistant.sdu@). |
| **Фільтр «Без підсумку»** у /meetings + tag на картці | `src/components/meetings/meetings-filters.tsx`, `meeting-card.tsx`, `meetings-dashboard.tsx` | Pill (amber tone) + amber-tag на картці. Логіка: `status='done' AND !comment.trim()`. Допомагає менеджеру швидко знайти що пропустив дописати після finish. |
| **Коментарі менеджера по клієнтах** (нова фіча) | див. розділ нижче | Власні замітки з історією, прив'язано до ClientID. |
| Аудит проекту | `docs/audit-2026-06-11.md` + `docs/audit-raw-findings.json` | Workflow з 12 паралельних audit-агентів, 85 знахідок (без adversarial-verify через помилку схеми). Roadmap на 4 фази у `docs/audit-2026-06-11.md`. |

### Sprint 2C — Коментарі менеджера по клієнтах (2026-06-11)

Менеджер / РМ / director / admin можуть лишати текстові коментарі по клієнту з 1С. Прив'язано до ClientID — історія лишається при передачі клієнта між менеджерами.

| Аспект | Рішення | Чому |
|---|---|---|
| Сховище | Supabase `client_comments` (не 1С) | Це власні замітки менеджера, не корпоративні дані. Швидке читання + не залежимо від 1С-розробника. |
| Авторство | `author_login` + snapshot `author_name` | Snapshot ФІО — щоб історія читалась навіть якщо менеджер звільниться. |
| Видалення | Soft-delete (`deleted_at`) | Видалити можна тільки свій. Admin — будь-який. У БД лишається для аудиту. |
| Bulk-counts | POST `/api/clients/comments/counts` | PostgREST GROUP BY не вміє → тягнемо `client_id_1c` для всіх id-ів і groupBy на Node. Кеш SWR 30s + hash-ключ від відсортованих id-ів. |
| Розміщення в UI | Між `ClientInfoBlock` і `PlanFactByBrand` у розгорнутій картці | Менеджер бачить замітки одразу після інфо клієнта, перед роботою з планом. |
| Бейдж у списку | «коментарі: N» поряд з «Остання подія» | Desktop інлайн, mobile окремим рядком. |
| Поле вводу | Auto-grow textarea (60px → 220px) | Без auto-grow довгий текст ховався вгору і початок не видно. |
| Length cap | 1-2000 chars (CHECK у БД + перевірка на API) | Захист від DoS / випадкових величезних paste. |

Migration 022: `client_comments` з частковими індексами WHERE `deleted_at IS NULL` для hot-read і bulk-counts.

### Sprint 2D — Верифікація нових клієнтів через КЦ (2026-06-12)

Коли менеджер створює нового клієнта (`registerNewClient` у 1С з резервом) — паралельно створюється картка у Bitrix24 SPA 1048 «Верифікація нового клієнта». КЦ-менеджери обробляють у Bitrix → закривають картку → менеджер отримує колокольчик-сповіщення у sales-planning.

| Аспект | Рішення | Чому |
|---|---|---|
| Сторона КЦ | Bitrix24 SPA 1048 з 5 стадіями (NEW → IN_PROGRESS → CLARIFICATION → VERIFIED/REJECTED) | КЦ-менеджери вже у Bitrix (мед-відділ для рекламацій теж там). Permission groups налаштовані. Той самий патерн що рекламації |
| Локальний кеш | Supabase `client_verifications` з `bitrix_item_id`, `status`, `manager_login`, `client_name` | Single source of truth — Bitrix. У нашій БД зберігаємо мінімум для UI бейджа і фільтра без runtime-запитів |
| Створення Bitrix-картки | `crm.item.add` через server-only `BITRIX_WEBHOOK_URL`, не блокує основний flow | Якщо Bitrix впав — клієнт у 1С вже зареєстрований. `bitrix_item_id` лишається `NULL`, можна потім вручну |
| Файли | Bitrix UF-поле з `Множинне=Так`, формат `[[name, base64], ...]` (як рекламації SPA 1038) | Single FILE-поле через REST не приймає base64. Multiple — приймає, той самий патерн що у `reclamation-app/api/index.py` |
| Bitrix-нотифікація КЦ при створенні | `im.notify` для `KC_USER_IDS` (5 user_id з `emet-call-center/config.py`) + посилання на картку | Аналог `MED_DEPT_USER_IDS` у рекламацій. КЦ бачить новий клієнт у своєму Bitrix-колокольчику миттєво |
| Webhook stage-changes | `reclamation-app` Python handler розширено фільтром по `entityTypeId=1048` + `ONCRMDYNAMICITEMUPDATE` event | Той самий endpoint що рекламації, єдине місце для всіх Bitrix-event-ів. `crm.item.get` для отримання `stageId` |
| Нотифікації у sales-planning | 3 нові типи: `client_verified` (emerald), `client_rejected` (rose), `client_clarification` (amber) | dedup_key `bitrix:verification:<id>:<status>` для idempotency. Link → `/clients?focus={id}` |
| Webhook auth | `timingSafeEqual` для `X-Internal-Secret` (той самий що рекламації) | Той самий secret, server-to-server |
| UI бейдж | `verification && (<amber-tag>На верифікації КЦ</amber-tag>)` на згорнутій картці клієнта | Прокинуто через `CategorySection` / `ReservedSection` / focus-view. Спінер `<Loader2 animate-spin>` показує очікування |
| SWR mutate | `globalMutate('/api/clients/verifications')` після успішного POST у new-client-dialog | Без цього бейдж з'являвся лише через 30с polling або hard refresh |

Бейдж не **блокує** дій менеджера з клієнтом — лише візуальна підказка. Менеджер може планувати зустріч / писати коментарі поки КЦ перевіряє.

1С НЕ синхронізується з Bitrix — КЦ вручну прибирає клієнта з резерву у 1С після верифікації (поки 1С-розробник не реалізує API `setReservation(false)`).

Migration 023: `client_verifications` з UNIQUE `bitrix_item_id` (idempotency для webhook lookup) + partial indexes WHERE `status IN ('pending','in_progress','clarification')`.

Файли:
- `src/lib/client-verifications/types.ts` — Bitrix-константи (entityTypeId=1048, BITRIX_FIELDS, BITRIX_STAGES, STAGE_TO_STATUS)
- `src/lib/bitrix-verification.ts` — `createVerificationRequest`, `notifyKcAboutNewVerification`, `fetchBitrixItem`
- `src/app/api/clients/verifications/route.ts` — GET (list для бейджа) + POST (створення)
- `src/app/api/clients/verifications/webhook/route.ts` — приймає від `reclamation-app`
- `src/lib/use-client-verifications.ts` — SWR хуки
- `public/kc-manual.html` — інструкція для КЦ-менеджерів

---

## 2. Tech stack

Підсумок: ми пишемо на TypeScript, у Next.js обгортці, для React UI, з Supabase БД, на Vercel хостингу. Усе нативно інтегровано.

| Шар | Технологія | Версія | Примітка |
|---|---|---|---|
| Framework | Next.js | 16.2.2 | App Router, Turbopack у dev, **webpack у prod** (`next build --webpack`) |
| UI | React | 19.2.4 | server + client components |
| Стилі | Tailwind CSS | 4.x | + `@tailwindcss/postcss` |
| Компоненти | shadcn/ui + @base-ui/react | latest | accordion, dialog, popover тощо |
| Іконки | lucide-react | 1.7 | inline SVG, stroke-width 2 |
| Шрифти | Plus Jakarta Sans + JetBrains Mono | — | через `next/font` |
| Стан | Zustand + SWR | 5 / 2.4 | Zustand — UI state, SWR — server cache (5-min dedup) |
| Auth | JWT (jose) | 6.2 | HttpOnly cookie `sp_session`, SameSite=Lax |
| БД | Supabase (Postgres) | — | Free plan, REST API через кастомний клієнт |
| Інтеграція | 1С Підприємство УТП | v2.7 | HTTP-сервіси з Basic Auth |
| Тестування | node:test + tsx + Playwright | — | unit (180+) + e2e (qa-review.mjs) |
| Деплой | Vercel | — | auto-deploy з `master`, Node 22 |
| CI | GitHub Actions | — | backup workflow 2×день |

### Важливі обмеження

- ⚠️ **НЕ можна використовувати `@supabase/supabase-js` SDK** — Turbopack у Next.js 16 не резолвить. Кастомний REST-клієнт у [src/lib/supabase.ts](./src/lib/supabase.ts).
- ⚠️ **Node на Vercel — тільки 22.x**, не 24.x.
- ⚠️ Build команда у [vercel.json](./vercel.json): `next build --webpack` (Turbopack ще не stable для prod).

---

## 3. Структура проекту

```
sales-planning/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # root layout + fonts + metadata
│   │   ├── page.tsx            # головна (роутить по role)
│   │   ├── manifest.ts         # PWA manifest
│   │   ├── icon.tsx + apple-icon.tsx
│   │   ├── admin/              # admin-only сторінки (планування lock-ів)
│   │   ├── clients/            # сторінка «Мої клієнти» (CRM-режим менеджера)
│   │   ├── debug-clients-api/  # debug-сторінка для тестування 1С actions
│   │   └── api/                # API routes (див. §8)
│   ├── components/
│   │   ├── dashboard/          # дашборди по ролях + building blocks
│   │   ├── planning/           # форма планування + client-search modal
│   │   ├── control/            # admin control panel
│   │   ├── layout/             # app-header
│   │   ├── login/              # login form
│   │   ├── ui/                 # shadcn primitives
│   │   ├── maintenance-banner.tsx
│   │   └── window-lock-banner.tsx
│   └── lib/                    # бізнес-логіка + helpers (див. §10)
├── tests/                      # unit-тести (180+)
├── scripts/                    # один-раз скрипти: backup, migrations, QA
├── supabase/migrations/        # 11 SQL міграцій з rollback-парами
├── public/
│   ├── manual.html             # інструкція для користувачів
│   ├── presentation.html       # презентація для команди
│   └── screenshots/            # для manual + presentation
├── docs/                       # технічна документація (див. §15)
├── .github/workflows/          # CI (backup-supabase, claude-review)
├── vercel.json                 # framework + buildCommand
├── package.json
└── README.md (цей файл)
```

---

## 4. Ролі та доступи

| Роль | Як отримує | Що бачить | Що може |
|---|---|---|---|
| **manager** | login через 1С credentials | свій dashboard + своє планування | редагувати тільки своє планування у відкритому вікні |
| **rm** (Regional Manager) | поле `region_manager_logins` у 1С | dashboard свого регіону + drill-down у будь-якого свого менеджера | переглядати + редагувати плани підлеглих |
| **director** | `DIRECTOR_PROXY_LOGIN` у [feature-flags.ts](./src/lib/feature-flags.ts), зараз `sdu@emet.in.ua` | dashboard всієї компанії + drill-down у будь-кого | переглядати + редагувати будь-чий план + керувати window-lock |
| **admin** | `ADMIN_LOGINS` у feature-flags, зараз `itd@emet.in.ua` (IT директор) | повний доступ + сторінка `/admin/planning-locks` | bypass finalize/window-lock, unfinalize, керувати глобальним lock |

Перевірка ролі — на бекенді у [src/lib/session.ts](./src/lib/session.ts) (з JWT cookie). Frontend ніколи не довіряє ролі з body — тільки з сесії.

---

## 5. Архітектура взаємодії

```
┌────────────────┐        ┌──────────────────────────┐
│   Browser      │  HTTPS │  Next.js (Vercel)        │
│  (manager UI)  │───────▶│  app/api/* + SSR pages   │
└────────────────┘        └──────┬───────────┬───────┘
                                 │           │
              ┌──────────────────┘           └──────────────────┐
              │ 1С HTTP-сервіси                                  │ Supabase REST
              │ Basic Auth + JSON                                │ apikey + JWT
              ▼                                                  ▼
        ┌──────────────┐                              ┌────────────────────┐
        │ 1С УТП       │                              │ Postgres (Supabase)│
        │ (читання)    │                              │ (планування state) │
        └──────────────┘                              └────────────────────┘
```

**Принцип розподілу даних:**
- **1С — джерело істини** для: клієнтів, плану по бренду, факту продажів, активностей (дзвінки/зустрічі), регіонів.
- **Supabase — наш store** для: прогнозів менеджера, gap_closures, finalize стану, window-lock налаштувань, snapshots для аудиту.

Користувач НЕ редагує 1С-дані з нашого додатка — тільки додає свій план поверх.

---

## 6. Інтеграція з 1С (13 actions)

Усі actions через єдиний proxy endpoint `POST /api/onec` з body `{action, ...payload}`. Whitelist у [src/app/api/onec/route.ts](./src/app/api/onec/route.ts), типи у [src/lib/onec-types.ts](./src/lib/onec-types.ts) + [src/lib/mityng-types.ts](./src/lib/mityng-types.ts), адаптери (1С → UI shape) у [src/lib/onec-adapters.ts](./src/lib/onec-adapters.ts).

### Sales Planning core (Actions 1-7)

| # | Action | Що повертає | Хто викликає |
|---|---|---|---|
| 1 | `login` | session + role + region + region_manager_logins | login form |
| 2 | `getClientsForPlanning` | список клієнтів закріплених за логіном (з категоріями A/B/C/D/нова) | client-search modal |
| 3 | `getSalesFact` | сума факту продажів за період по сегменту | manager-dashboard hero, clients-page (chunked 400) |
| 4 | `getRegistryPlans` | план з 1С реєстру по логіну + сегменту | manager-dashboard, planning-form, clients-page Hero1 |
| 5 | `getRegionData` | агрегат по регіону: менеджери + їх плани + факт (+ `includeAll` v2.7) | rm-dashboard, director-dashboard, /admin/company-overview |
| 6 | `getTrainings` | (не використовується активно) | — |
| 7 | `checkActivities` | hasCall/hasMeeting per клієнт за період | planning-form auto-confirm |

### CRM-сторінка integration (Actions 8-12, v2.7)

Whitelisted з Митинга 4.0 — використовується на сторінці `/clients` (CRM-режим менеджера).

| # | Action | Що повертає | Хто викликає |
|---|---|---|---|
| 8 | `getManagerClients` | bulk-список клієнтів + категорії + `isReserved` + `LastMeetingDate` (v2.7) | clients-page Hero, useMyClients |
| 9 | `findClient` | глобальний пошук клієнта (по всіх менеджерах) | clients-page search |
| 10 | `getClientReport` | 3-міс історія + події + clientInfo + `properties[]` + `seminars` + `yearlySalesReport` (v2.7) | clients-page expanded row, useClientReport (lazy) |
| 11 | `getAllMeetingsForClient` | усі зустрічі по клієнту (shape unverified, whitelisted) | (поки не використовується) |
| 12 | `getClientFocus` | bulk-фокуси клієнтів (Action A, v2.7) | clients-page chips, useClientFocuses (chunked 200) |
| 13 | `getClientActivationPlan` | план активації бази по категоріях (Action B) — `{login, period}` → `activations[]` | clients-page Hero3 «План активації», useClientActivationPlan |

Детальна специфікація: [docs/1C_API_SPECIFICATION.md](./docs/1C_API_SPECIFICATION.md).

### Особливості

- **Логіни прив'язки клієнтів** — у 1С клієнт закріплений за конкретним менеджером по login. Один менеджер може бути у 2-х регіонах (Пашковська) — Action 5 повертає його в обох.
- **LOGIN_BOUND_ACTIONS** — для actions 2,3,4,7 backend проксує `targetLogin` лише якщо у сесії роль rm/director/admin (повноваження див. [src/app/api/onec/route.ts](./src/app/api/onec/route.ts)).
- **PostgREST escape gotcha:** `URLSearchParams` подвійно енкодить емейли з `.` — використовуємо ручний `encodeURIComponent` + concat (баг fix `ab47451`).

---

## 7. Схема БД (Supabase)

Усі таблиці у `public.` схемі. SQL-міграції з rollback-парами у [supabase/migrations/](./supabase/migrations/).

```
users
  id (text PK) ← login з 1С (M5: text замість uuid)
  full_name, role, region, region_code
  created_at, updated_at

periods                                        ← місячні плани (M7)
  id (uuid PK)
  segment_code  ← бренд: petaran, juvederm, ...
  month         ← '2026-05-01' (1-е число місяця)
  amount        ← сума плану з 1С реєстру
  unique(segment_code, month)

forecasts                                      ← прогноз менеджера
  id, login (FK users.id), period_id (FK periods.id)
  client_id_1c, client_name, category
  stage          ← Дзвінок/Зустріч/Навчання
  stage_done, stage_comment
  amount
  archived_at    ← soft-delete (M8)

gap_closures                                   ← план закриття розриву
  id, login, period_id
  client_id_1c, client_name, category
  stage, stage_done, stage_comment
  amount
  archived_at

period_summaries                               ← finalize стан + gap actions
  id, login, period_id
  gap_action_1, gap_action_2, gap_action_3
  finalized_at   ← NULL = чернетка, timestamp = фіналізовано (M9)
  unique(login, period_id)

planning_snapshots                             ← одноразова фіксація (M6)
  id, login, period_id
  client_id_1c
  source ← 'forecast' | 'gap_closure'
  unique(login, period_id, client_id_1c)
  ⚠️ ON CONFLICT DO NOTHING — пишеться один раз

planning_locks                                 ← window-lock (M10)
  id, scope ← 'global' | 'user'
  target_login (NULL для global)
  month
  mode ← 'allow' | 'block'
  set_by_login, set_at

actual_activities                              ← кеш Action 7 (M11)
  login, period_id, client_id_1c
  has_call, has_meeting, checked_at

users.can_unfinalize_plans                     ← M10 (2026-06-08)
  boolean default false — per-user дозвіл розфіналізації

meetings                                       ← Sprint 1.5 (2026-06)
  id (uuid PK)
  legacy_1c_id                ← 1С-ID (формат "0000001287920260608"), unique
  manager_login, client_id_1c
  client_name, client_phone, client_category  ← snapshot з 1С (для display)
  date, time, duration_min
  status ← planned/in_progress/done/cancelled/postponed
  purpose, comment, planned_address
  start_address, start_lat, start_lon, started_at
  end_address, end_lat, end_lon, finished_at
  geo_manual ← true якщо адресу ввели руками
  anketa_data_json ← підсумкова анкета клієнта (структура з 1С Survey)
  created_at, updated_at

client_comments                                ← коментарі менеджера (Sprint 2C, 2026-06-11)
  id (bigserial PK)
  client_id_1c                ← ClientID з 1С (історія прив'язана до клієнта)
  author_login                ← хто написав
  author_name                 ← snapshot ФІО на момент створення
  comment                     ← текст (CHECK 1-2000 chars)
  created_at, deleted_at      ← soft-delete (видалити можна тільки свій)
  -- Партійні індекси WHERE deleted_at IS NULL:
  --   idx_client_comments_client_active (client_id_1c, created_at DESC) — hot read
  --   idx_client_comments_client_count (client_id_1c) — для bulk-counts

meeting_syncs                                  ← buffer queue (Sprint 1.5, наразі неактивна)
  id (uuid PK), meeting_id (FK)
  operation ← save/update/start/finish/reschedule/cancel
  status    ← pending/syncing/synced/failed
  payload_snapshot (jsonb), onec_response (jsonb)
  retry_count, failure_reason, next_retry_at, synced_at
  created_at
  -- Cron-worker /api/cron/sync-meetings виявся непридатним
  -- (race conditions при cron-failure → дублі). Sprint 1.5 переписаний
  -- на sync writes. Таблиця залишена для майбутніх arch-ітерацій.
```

Документ зі схемою у memory (`supabase_schema.md`) — оновлюваний reference.

### Backup стратегія

Auto + manual. Деталі: [docs/BACKUPS.md](./docs/BACKUPS.md).

---

## 8. API routes

```
src/app/api/
├── auth/
│   ├── login/route.ts         POST  → 1С login → set sp_session cookie
│   ├── logout/route.ts        POST  → clear cookie
│   └── me/route.ts            GET   → current session info
├── onec/
│   ├── route.ts               POST  → proxy до 1С (whitelist actions 1-7)
│   └── region-stats/route.ts  GET   → cached agregate Action 5 per region
├── planning/
│   ├── route.ts               GET   → load forecasts+gap+summary
│   │                          POST  → save (atomic forecasts+gap+summary)
│   ├── aggregate/route.ts     GET   → агрегат для director: byLogin/byBrand
│   ├── finalize/route.ts      POST  → finalize, DELETE → unfinalize (admin), GET → status
│   ├── confirm-activities/route.ts  PATCH → mass-update stage_done з Action 7
│   ├── init-snapshot/route.ts POST  → одноразова фіксація списку клієнтів
│   └── window-check/route.ts  GET   → can-edit-now check
├── admin/
│   ├── planning-locks/route.ts          GET/POST/DELETE для window-lock CRUD
│   ├── planning-settings/route.ts       глобальні налаштування
│   ├── company-overview/route.ts        Дашборд «Огляд компанії» (admin/director)
│   ├── company-overview-permissions/    Toggle доступу до «Огляду компанії» (admin only)
│   ├── stage-edit-permissions/          M9: per-user дозвіл редагувати etap після фіналу
│   ├── unfinalize-permissions/          M10 (2026-06-08): per-user дозвіл розфіналізувати
│   ├── sync-dlq/                        DLQ зустрічей — sync errors (admin tools)
│   └── sync-meetings-now/               Manual trigger cron-worker (admin only)
├── meetings/                            🆕 Sprint 1.5
│   ├── route.ts                  GET   → list (БД + sync 1С getInitialData)
│   │                             POST  → create (sync 1С saveNewMeeting → INSERT)
│   ├── [id]/route.ts             PATCH → op: update/start/finish/cancel (sync 1С → UPDATE БД)
│   └── check-conflict/route.ts   POST  → перевірка чи є конфлікт у даті/часі менеджера
├── cron/
│   └── sync-meetings/route.ts    GET   → cron-worker (зараз no-op після переходу на sync write)
├── geocode/route.ts              POST  → reverse-geocode lat/lon → address (для зустрічей)
├── clients/
│   ├── plan-totals/route.ts      POST  → план з Supabase forecasts+gap_closures per-client (/clients)
│   └── comments/                  🆕 Sprint 2C (2026-06-11)
│       ├── route.ts              GET   → список коментарів по clientId1c
│       │                         POST  → додати коментар (1-2000 chars)
│       ├── [id]/route.ts         DELETE → soft-delete (свій або admin будь-який)
│       └── counts/route.ts       POST  → bulk { [clientId]: count } для бейджа у списку
└── archive/route.ts              POST  → soft-delete forecast/gap (set archived_at)
```

### Критичні правила

- POST `/api/planning` має **filtered-mode**: коли план фіналізований і викликає не admin, дозволені тільки `stage_comment` + `stage_done`. Інші поля ігноруються.
- Усі POST з модифікацією йдуть через `assertWindowAllowed` ([src/lib/window-guard.ts](./src/lib/window-guard.ts)).
- `targetLogin` з body допустимий тільки якщо сесія = rm/director/admin (інакше використовується `session.login`).
- DELETE `/api/planning/finalize` (розфіналізація) — admin завжди, інші юзери тільки якщо `users.can_unfinalize_plans=true` (M10).
- POST/PATCH `/api/meetings/*` — синхронний 1С виклик (5-15с). Якщо 1С fail → БД не змінюється (нема дублів). Це SPRINT 1.5 архітектурне рішення після того як buffer-pattern створив дублі у проді 2026-06-08.

---

## 9. Frontend компоненти

### Дашборди (role-specific)

| Файл | Роль | Що показує |
|---|---|---|
| [manager-dashboard.tsx](./src/components/dashboard/manager-dashboard.tsx) | manager | hero (План/Факт/Виконання/Клієнти) + 9 BrandRow + ClientStatsCard |
| [rm-dashboard.tsx](./src/components/dashboard/rm-dashboard.tsx) | rm | hero + ManagerAccordion список + BrandManagerGroup cross-view |
| [director-dashboard.tsx](./src/components/dashboard/director-dashboard.tsx) | director | hero + PlanningReadinessCard + CategoryStatsTable + RegionAccordion список + BrandRegionGroup |

### Building blocks (reusable)

| Файл | Що робить |
|---|---|
| [brand-row.tsx](./src/components/dashboard/brand-row.tsx) | Універсальний рядок бренду (10-col xl grid: name·badge·dyn·progress·plan·fact·mngr·prev·chevron·drill) |
| [region-accordion.tsx](./src/components/dashboard/region-accordion.tsx) | Регіон-картка на Director, expand → 9 BrandRow + manager mini-list |
| [manager-accordion.tsx](./src/components/dashboard/manager-accordion.tsx) | Менеджер-картка на РМ, expand → 9 BrandRow (клік → planning brand×manager) |
| [brand-region-group.tsx](./src/components/dashboard/brand-region-group.tsx) | Cross-view Director: бренд → регіони → менеджери |
| [brand-manager-group.tsx](./src/components/dashboard/brand-manager-group.tsx) | Cross-view РМ: бренд → менеджери |
| [brand-expanded-details.tsx](./src/components/dashboard/brand-expanded-details.tsx) | Manager dashboard: 4 client-category cards + Незаплановані |
| [client-stats-card.tsx](./src/components/dashboard/client-stats-card.tsx) | Active/Sleeping/New stats — 4-та hero картка |
| [planning-readiness-card.tsx](./src/components/dashboard/planning-readiness-card.tsx) | Director: скільки менеджерів фіналізували план (tri-state: finalized/partial/empty) |
| [metric-card.tsx](./src/components/dashboard/metric-card.tsx) | Універсальна hero-метрика |

### Планування

- [planning-form.tsx](./src/components/planning/planning-form.tsx) — головна форма (~2150 рядків): forecast + gap rows, stage selector, finalize button, save bar, dialog confirmations
- [client-search-modal.tsx](./src/components/planning/client-search-modal.tsx) — пошук + додавання клієнтів з Action 2

### Клієнти-сторінка (CRM-режим менеджера)

- [src/app/clients/page.tsx](./src/app/clients/page.tsx) — entry-point з auth-gate
- [src/components/clients/clients-page.tsx](./src/components/clients/clients-page.tsx) — основний компонент (~2900 рядків): 4-картковий Hero band, Reserved-секція, expandable client rows, brand plan/fact table, search, focus chips, «Остання подія» + бейдж коментарів у згорнутій картці, mobile-footer з action-кнопками. TD-11: god component — розбити на модулі (див. `docs/audit-2026-06-11.md` Month 2-3).
- [src/components/clients/client-comments-section.tsx](./src/components/clients/client-comments-section.tsx) — **Sprint 2C (2026-06-11)**: коментарі менеджера у розгорнутій картці (auto-grow textarea, soft-delete, історія)
- [src/components/clients/new-client-dialog.tsx](./src/components/clients/new-client-dialog.tsx) — створення клієнта через 1С `registerNewClient`
- [src/components/clients/global-client-search-dialog.tsx](./src/components/clients/global-client-search-dialog.tsx) — пошук «По всій базі EMET»

### Admin сторінки

- [src/app/admin/page.tsx](./src/app/admin/page.tsx) — меню адмін-функцій (8 карток)
- [planning-locks/page.tsx](./src/app/admin/planning-locks/page.tsx) — графік + персональні allow/block
- [stage-edit-permissions/page.tsx](./src/app/admin/stage-edit-permissions/page.tsx) — M9: дозвіл редагувати «Етап» після фіналу
- [unfinalize-permissions/page.tsx](./src/app/admin/unfinalize-permissions/page.tsx) — **M10 (2026-06-08)**: дозвіл розфіналізовувати плани (без admin)
- [company-overview/page.tsx](./src/app/admin/company-overview/page.tsx) — дашборд по 13 підрозділах
- [company-overview-permissions/page.tsx](./src/app/admin/company-overview-permissions/page.tsx) — кому показувати toggle
- [sync-dlq/page.tsx](./src/app/admin/sync-dlq/page.tsx) — DLQ зустрічей (failed sync items)
- [analytics-preview/page.tsx](./src/app/admin/analytics-preview/page.tsx) — preview 5 додаткових KPI

### Зустрічі (Sprint 1.5)

- [src/app/meetings/page.tsx](./src/app/meetings/page.tsx) — entry-point з auth-gate
- [src/components/meetings/meetings-dashboard.tsx](./src/components/meetings/meetings-dashboard.tsx) — основна сторінка: 4 KPI cards, filters bar, search, day-groups, MeetingForm/Reschedule/Outcome dialogs orchestration
- [meeting-card.tsx](./src/components/meetings/meeting-card.tsx) — картка однієї зустрічі (5 станів: planned/in_progress/done/cancelled/postponed) + LiveTimer + action buttons
- [meeting-form.tsx](./src/components/meetings/meeting-form.tsx) — форма create/edit (клієнт-picker, дата/час, тривалість, мета, адреса, коментар + conflict-check debounce 400ms)
- [location-capture-dialog.tsx](./src/components/meetings/location-capture-dialog.tsx) — Start/Finish з GPS (navigator.geolocation + manual fallback)
- [meeting-outcome-dialog.tsx](./src/components/meetings/meeting-outcome-dialog.tsx) — анкета клієнта при finish (динамічна структура з 1С Survey)
- [reschedule-dialog.tsx](./src/components/meetings/reschedule-dialog.tsx) — перенесення (auto-comment «Перенесено зі старої дати»)
- [client-picker-dialog.tsx](./src/components/meetings/client-picker-dialog.tsx) — bottom-sheet з 3 джерелами (мої / всі EMET / новий)
- [day-group.tsx](./src/components/meetings/day-group.tsx) — групування «Сьогодні / Завтра / DD.MM.YYYY»
- [meetings-filters.tsx](./src/components/meetings/meetings-filters.tsx) — date presets + status pills + search

### Інше

- [window-lock-banner.tsx](./src/components/window-lock-banner.tsx) — три-tier: admin (ніколи) / director (global-block тільки) / manager+rm (завжди коли locked)
- [maintenance-banner.tsx](./src/components/maintenance-banner.tsx) — `FEATURES.PLANNING_DISABLED` rescue
- [layout/app-header.tsx](./src/components/layout/app-header.tsx) — top bar з лого, юзером, logout

⚠️ **Інваріанти захищають від регресії** — [docs/ARCHITECTURE_INVARIANTS.md](./docs/ARCHITECTURE_INVARIANTS.md). Перед видаленням компонентів — обовʼязково прочитати.

---

## 10. Lib helpers

| Файл | Що робить |
|---|---|
| [supabase.ts](./src/lib/supabase.ts) | Кастомний REST клієнт для Postgres (заміна SDK) |
| [session.ts](./src/lib/session.ts) | JWT cookie + getSession для server components |
| [api-auth.ts](./src/lib/api-auth.ts) | Перевірка ролі у API routes |
| [onec-client.ts](./src/lib/onec-client.ts) | HTTP до 1С з Basic Auth |
| [onec-adapters.ts](./src/lib/onec-adapters.ts) | Адаптери 1С → UI shape (фільтр архівних регіонів) |
| [onec-types.ts](./src/lib/onec-types.ts) | TypeScript типи усіх 13 actions (Sales Planning core + Митинг integration + getClientActivationPlan) |
| [mityng-types.ts](./src/lib/mityng-types.ts) | Типи Митинг-actions (`ClientFromOneC`, `ClientReport`, `BrandSalesHistory`, `ClientEvent`, `ClientSeminar`) + helpers (`isClientReserved`, `getClientName`, `getClientAddress`, `getLastMeetingDate`, `getLastCallDate`) |
| [use-onec-data.ts](./src/lib/use-onec-data.ts) | SWR-хук для 1С call'ів |
| [use-my-clients.ts](./src/lib/use-my-clients.ts) + [client-batching.ts](./src/lib/client-batching.ts) | 6 hooks для CRM-сторінки: `useMyClients` (bulk-список), `useClientReport` (lazy 1-client deep), `useClientsTotals` (план+факт chunked 400), `useClientActivities` + `useClientFocuses` (chunked 200×4 = до 800), `useClientActivationPlan` (Action B). Чисті batching-функції (chunk/merge) винесено у `client-batching.ts` з юніт-тестами |
| [use-client-comments.ts](./src/lib/use-client-comments.ts) + [client-comments/types.ts](./src/lib/client-comments/types.ts) | **Sprint 2C (2026-06-11)**: `useClientComments(clientId1c)` SWR-список, `useClientCommentsCounts(clientIds)` bulk-counts для бейджа у списку, `addClientComment/deleteClientComment` мутації з revalidate |
| [use-planning-aggregate.ts](./src/lib/use-planning-aggregate.ts) | SWR-хук для `/api/planning/aggregate` |
| [use-clients-for-planning.ts](./src/lib/use-clients-for-planning.ts) | SWR Action 2 |
| [use-registry-plans.ts](./src/lib/use-registry-plans.ts) | SWR Action 4 |
| [use-region-stats.ts](./src/lib/use-region-stats.ts) | SWR `/api/onec/region-stats` |
| [use-finalization.ts](./src/lib/use-finalization.ts) | Хук статусу finalize + savePlanning + finalizePlan |
| [use-window-status.ts](./src/lib/use-window-status.ts) | Хук `/api/planning/window-check` |
| [region-aggregates.ts](./src/lib/region-aggregates.ts) | aggregateRegion / aggregateManagers / aggregateCompany |
| [region-stats-aggregate.ts](./src/lib/region-stats-aggregate.ts) | Cache layer для RegionData |
| [unplanned-buyers.ts](./src/lib/unplanned-buyers.ts) | Cross-ref Actions 2+3 → «незаплановані покупці» |
| [planning-window.ts](./src/lib/planning-window.ts) | `canPlanForMonth()` — pure helper з 14 unit-тестами |
| [window-guard.ts](./src/lib/window-guard.ts) | `assertWindowAllowed()` для POST endpoints |
| [load-window-state.ts](./src/lib/load-window-state.ts) | Підвантаження planning_locks |
| [working-days.ts](./src/lib/working-days.ts) | Робочі дні з UA-святами |
| [periods.ts](./src/lib/periods.ts) | Місячні period_id (1-е число) |
| [regions.ts](./src/lib/regions.ts) | Активні регіони (8) + архівні фільтр |
| [feature-flags.ts](./src/lib/feature-flags.ts) | FEATURES + ADMIN_LOGINS + DIRECTOR_PROXY_LOGIN |
| [rate-limit.ts](./src/lib/rate-limit.ts) | In-memory rate limiter для /api/auth |
| [format.ts](./src/lib/format.ts) | formatCurrency, formatPct, formatDate |
| [selection-sync.ts](./src/lib/selection-sync.ts) | Sync forecast↔gap при стейдж-переключенні |

---

## 11. State machine планування

```
            ┌──────────────┐
            │  чернетка    │  finalized_at = NULL
            │ (draft)      │  manager редагує все
            └──────┬───────┘
                   │  «Фінальне збереження» (manager click)
                   ▼
            ┌──────────────┐
            │  finalized   │  finalized_at = timestamp
            │              │  manager редагує тільки stage_comment + stage_done
            └──────┬───────┘
                   │  admin unfinalize (через DELETE /api/planning/finalize)
                   ▼
            ┌──────────────┐
            │  чернетка    │  finalized_at = NULL знов
            └──────────────┘
```

### Window-lock пріоритет

```
user-allow > user-block > global-block > window_days (за замовч)
```

- **window_days** — стандартне правило (наприклад: до 5-го числа місяця)
- **global-block** — Director закриває всім
- **user-block** — Director закриває конкретному менеджеру (бан)
- **user-allow** — Director ВІДКРИВАЄ конкретному менеджеру попри global-block

Pure-функція `canPlanForMonth()` у [planning-window.ts](./src/lib/planning-window.ts).

---

## 12. Deploy і environment

### Vercel

- **Production:** `master` → [sales-planning.vercel.app](https://sales-planning.vercel.app)
- **Build:** `next build --webpack` (Turbopack не для prod)
- **Node:** 22.x
- **Preview:** УСІ гілки крім `backups` (заблокована через vercel.json на самій гілці)

### Environment variables (Vercel + .env локально)

| Variable | Призначення |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase проекту |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (повний доступ повз RLS) |
| `SESSION_SECRET` | мін 32 байти для JWT (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `ONEC_BASE_URL` | URL 1С HTTP-сервісу |
| `ONEC_USER` / `ONEC_PASSWORD` | Basic Auth для 1С |
| `BITRIX_WEBHOOK_URL` | webhook URL Bitrix24 (для модуля рекламацій) — `https://bitrix.emet.in.ua/rest/<user_id>/<token>/` |
| `NOTIFICATIONS_INTERNAL_SECRET` | shared secret (64 hex) для server-to-server auth з `reclamation-app` webhook → `/api/notifications/internal`. Той самий має бути у Vercel env обох проектів |
| `NEXT_PUBLIC_SENTRY_DSN` | (опційно) DSN для Sentry error tracking — `.replace(/^﻿/, '')` sanitize вбудовано на випадок BOM-маркера |
| `WINDOW_DAYS` | (опційно) кількість днів вікна планування |

⚠️ **Ніколи не комітити `.env`**, є `.env.example` з шаблоном.

### Связка з `reclamation-app` Vercel-проектом

Окремий FastAPI/Python проект [github.com/EmetITteam/reclamation-app](https://github.com/EmetITteam/reclamation-app) на Vercel приймає `ONCRMTIMELINECOMMENTADD` webhook від Bitrix24. При новому коментарі мед-відділу — шле POST на `https://sales-planning-lyart.vercel.app/api/notifications/internal` з `X-Internal-Secret` header. Колокольчик у sales-planning його одразу показує.

Env у reclamation-app Vercel-проекті:

| Variable | Призначення |
|---|---|
| `NOTIFICATIONS_INTERNAL_SECRET` | той самий secret що у sales-planning |
| `BITRIX_WEBHOOK_URL` | той самий webhook URL що у sales-planning |
| `TG_NOTIFICATIONS_DISABLED` | `true` щоб відключити TG-бот (поки користувачі отримують повідомлення тільки через колокольчик). Прибрати змінну → TG увімкнеться знов. |
| `SP_NOTIF_URL` | (опційно) override URL `/api/notifications/internal`. Default `sales-planning-lyart.vercel.app`. |

### GitHub Actions

- **`backup-supabase.yml`** — двічі на день дамп БД у гілку `backups`
- **`claude-code-review.yml`** — auto-review PR від Claude
- **`claude.yml`** — на pull-request події

### Git hooks (husky)

- **pre-push** (`prepush` у package.json): `tests + tsc --noEmit + architecture-check.mjs` — НЕ skip це `--no-verify`

---

## 13. Backups і відновлення

Повна стратегія: [docs/BACKUPS.md](./docs/BACKUPS.md).

**Коротко:**
- Auto: GitHub Actions cron 09:00 + 20:00 Київ → гілка `backups`
- Manual: `node scripts/backup-supabase.mjs` перед кожною DDL міграцією
- Restore-скрипт: `scripts/restore-from-backup.mjs <path>` (stub, написати при потребі)

---

## 14. Тести і QA

### Unit-тести (`npm test`)

180+ тестів у [tests/](./tests/), фокус на pure-логіці:

| Файл | Покриває |
|---|---|
| `action7-check-activities.test.ts` | One-way activity sync (Action 7) |
| `admin-role.test.ts` | Permission matrix |
| `auto-populate-guard.test.ts` | Захист від оверрайту вже-збереженого |
| `category-3month-rule.test.ts` | Активний по бренду = 3 міс |
| `escape-filter-value.test.ts` | PostgREST escape |
| `m8-soft-delete.test.ts` | archived_at filtering |
| `monthly-period-id.test.ts` | 1-е число місяця в period.id |
| `planning-window.test.ts` | canPlanForMonth (14 кейсів) |
| `region-stats-aggregate.test.ts` | Action 5 aggregation |
| `security-fixes.test.ts` | Role escalation prevention |
| `selection-sync.test.ts` | Forecast↔gap stage switch |
| `working-days.test.ts` | UA holidays |

### E2E QA (`npm run qa`)

Playwright headed-mode скрипт [scripts/qa-review.mjs](./scripts/qa-review.mjs): автологін, ходить по розділах, скриншоти у `scripts/qa-output/`, друкує ✅/❌/💡. **За замовчуванням НЕ headless** — користувач хоче бачити вікно в реальному часі.

### Architecture check (`npm run check:arch`)

[scripts/architecture-check.mjs](./scripts/architecture-check.mjs) — перевіряє що ключові файли і експорти не зникли. Захист після інциденту `0767809` (Claude видалив 5 компонентів які потім довелось відновлювати 6 годин).

---

## 15. Документація

| Файл | Призначення |
|---|---|
| [README.md](./README.md) | цей файл — overview |
| [CHANGELOG.md](./CHANGELOG.md) | хронологія етапних релізів і фічей |
| [CLAUDE.md](./CLAUDE.md) | інструкції для AI-агентів |
| [AGENTS.md](./AGENTS.md) | загальне нагадування для AI |
| [docs/README.md](./docs/README.md) | навігаційний індекс по docs/ |
| [docs/ARCHITECTURE_INVARIANTS.md](./docs/ARCHITECTURE_INVARIANTS.md) | список захищених від видалення компонентів (15 розділів архітектурних правил) |
| [docs/1C_API_SPECIFICATION.md](./docs/1C_API_SPECIFICATION.md) | специфікація 12 actions 1С з прикладами (v2.7) |
| [docs/1C_EMBED_SPEC.md](./docs/1C_EMBED_SPEC.md) | embed нашого UI у 1С (якщо знадобиться) |
| [docs/BACKUPS.md](./docs/BACKUPS.md) | стратегія резервного копіювання |
| [docs/CHECKLIST_NEXT_PROJECT.md](./docs/CHECKLIST_NEXT_PROJECT.md) | чек-ліст для наступних схожих проектів |
| [docs/BACKLOG.md](./docs/BACKLOG.md) | поточний backlog (P0/P1/P2/P3) — тех-борг, баги, нові фічі |
| [docs/planning/strategic-kpi-spec.md](./docs/planning/strategic-kpi-spec.md) | специфікація дашборду «Стратегія» (%-джерело, канали, IUSE, файли, RPC) |
| [docs/planning/decisions.md](./docs/planning/decisions.md) | ADR (ADR-19: % зі «Огляд компанії» як єдине джерело) |
| [docs/SPEC_PENDING_1C_ITEMS.md](./docs/SPEC_PENDING_1C_ITEMS.md) | специфікації до 1С — усі pending закриті (Action B доставлено 28.05) |
| [docs/SPEC_CLIENTSTATS_DISCREPANCY.md](./docs/SPEC_CLIENTSTATS_DISCREPANCY.md) | open question Action 5 clientStats |
| [docs/ARCHIVE_PLANS.md](./docs/ARCHIVE_PLANS.md) | архів виконаних планів (PLAN V2 + clients-page) |
| [docs/ARCHIVE_SPECS_RESOLVED.md](./docs/ARCHIVE_SPECS_RESOLVED.md) | архів виконаних специфікацій (Action 5 includeAll, getClientFocus, isReserved) |
| [public/manual.html](./public/manual.html) | інструкція для кінцевих користувачів |
| [public/presentation.html](./public/presentation.html) | презентація системи для команди |

### Git tags (етапні віхи)

```bash
git tag --list 'etalon-*'
# etalon-2026-05-12          — M7 monthly pid + M8 soft-delete
# etalon-2026-05-13          — Adminrole + finalize + window-lock + redesign
# etalon-glass-prod-2026-05-29 — glass-редизайн + /clients CRM + Огляд компанії (PROD)
# prod-pre-glass-merge       — стан master ДО glass-merge (rollback-якір)
# etalon-strategic-kpi-2026-07-03 — дашборд «Стратегія» у проді (% зі «Огляд компанії», ADR-19)
```

Щоб повернутись на еталон: `git checkout etalon-glass-prod-2026-05-29`.
Відкат прод-merge: Vercel instant-rollback АБО `git revert -m 1 <merge>` / reset на `prod-pre-glass-merge`.

---

## Контакти

- **Проект:** EMET IT (`itd@emet.in.ua`)
