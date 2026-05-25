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
6. [Інтеграція з 1С (7 actions)](#6-інтеграція-з-1с-7-actions)
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

Менеджери з продажів щомісяця планують:
- **Прогноз** — кого з активних клієнтів обзвонять/зустрінуться для повторної покупки + орієнтовна сума
- **Закриття розриву** — кого «розбудять» (сплячі клієнти, які купували > 3 місяці тому) щоб закрити різницю між планом 1С і прогнозом
- **Дії по розриву** — текст «що робитимуть» (gap_action_1/2/3)

РМ і Директор бачать агрегацію по своїй ієрархії: регіон/менеджер/бренд, з кольоровою індикацією виконання плану й готовності планування.

### Ключові механіки

- **Жорстке finalize** — менеджер фіксує план («Фінальне збереження») і далі може правити тільки коментарі по етапах. РМ/Director бачать на dashboard у скільки людей план уже фінальний.
- **Активність по бренду = 3 місяці**, а не 1С-категорія. Клієнт «активний по Petaran» якщо купував Petaran за останні 90 днів — інакше йде у Gap.
- **Window-lock** — Director керує вікном планування: глобальний lock на період, або per-user allow/block override.
- **One-way activity sync** з 1С — Action 7 повертає `hasCall`/`hasMeeting` per клієнта → frontend автоматично ставить `stage_done=true` (але назад не скидає).
- **Snapshot fixation** — при першому збереженні плану `planning_snapshots` записує список клієнтів навіки, щоб історичні «незаплановані» не зникали при правках.

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
| Інтеграція | 1С Підприємство УТП | v2.6 | HTTP-сервіси з Basic Auth |
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

## 6. Інтеграція з 1С (7 actions)

Усі actions через єдиний proxy endpoint `POST /api/onec` з body `{action, ...payload}`. Whitelist у [src/app/api/onec/route.ts](./src/app/api/onec/route.ts), типи у [src/lib/onec-types.ts](./src/lib/onec-types.ts), адаптери (1С → UI shape) у [src/lib/onec-adapters.ts](./src/lib/onec-adapters.ts).

| # | Action | Що повертає | Хто викликає |
|---|---|---|---|
| 1 | `login` | session + role + region + region_manager_logins | login form |
| 2 | `getClientsForPlanning` | список клієнтів закріплених за логіном (з категоріями A/B/C/D/нова) | client-search modal |
| 3 | `getSalesFact` | сума факту продажів за період по сегменту | manager-dashboard hero |
| 4 | `getRegistryPlans` | план з 1С реєстру по логіну + сегменту | manager-dashboard, planning-form |
| 5 | `getRegionData` | агрегат по регіону: менеджери + їх плани + факт | rm-dashboard, director-dashboard |
| 6 | `getTrainings` | (не використовується активно) | — |
| 7 | `checkActivities` | hasCall/hasMeeting per клієнт за період | planning-form auto-confirm |

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
│   ├── planning-locks/route.ts      GET/POST/DELETE для window-lock CRUD
│   └── planning-settings/route.ts   глобальні налаштування
└── archive/route.ts           POST  → soft-delete forecast/gap (set archived_at)
```

### Критичні правила

- POST `/api/planning` має **filtered-mode**: коли план фіналізований і викликає не admin, дозволені тільки `stage_comment` + `stage_done`. Інші поля ігноруються.
- Усі POST з модифікацією йдуть через `assertWindowAllowed` ([src/lib/window-guard.ts](./src/lib/window-guard.ts)).
- `targetLogin` з body допустимий тільки якщо сесія = rm/director/admin (інакше використовується `session.login`).

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
| [onec-types.ts](./src/lib/onec-types.ts) | TypeScript типи усіх 7 actions |
| [use-onec-data.ts](./src/lib/use-onec-data.ts) | SWR-хук для 1С call'ів |
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
| `WINDOW_DAYS` | (опційно) кількість днів вікна планування |

⚠️ **Ніколи не комітити `.env`**, є `.env.example` з шаблоном.

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
| [docs/ARCHITECTURE_INVARIANTS.md](./docs/ARCHITECTURE_INVARIANTS.md) | список захищених від видалення компонентів |
| [docs/1C_API_SPECIFICATION.md](./docs/1C_API_SPECIFICATION.md) | специфікація 7 actions з прикладами |
| [docs/1C_EMBED_SPEC.md](./docs/1C_EMBED_SPEC.md) | embed нашого UI у 1С (якщо знадобиться) |
| [docs/BACKUPS.md](./docs/BACKUPS.md) | стратегія резервного копіювання |
| [docs/CHECKLIST_NEXT_PROJECT.md](./docs/CHECKLIST_NEXT_PROJECT.md) | чек-ліст для наступних схожих проектів |
| [public/manual.html](./public/manual.html) | інструкція для кінцевих користувачів |
| [public/presentation.html](./public/presentation.html) | презентація системи для команди |

### Git tags (етапні віхи)

```bash
git tag --list 'etalon-*'
# etalon-2026-05-12      — M7 monthly pid + M8 soft-delete
# etalon-2026-05-12-v2   — Action 7 + PlanningReadinessCard
# etalon-2026-05-13      — Adminrole + finalize + window-lock + redesign
```

Щоб повернутись на еталон: `git checkout etalon-2026-05-13`.

---

## Контакти

- **Проект:** EMET IT (`itd@emet.in.ua`)
