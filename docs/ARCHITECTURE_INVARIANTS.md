# Architecture Invariants — захист від регресії

> **Призначення цього документу:** перш ніж видаляти / рефакторити / «чистити» код у директоріях `src/components/dashboard/`, `src/components/planning/`, `src/lib/onec-*`, `src/lib/region-aggregates*`, `src/lib/unplanned-buyers*` — **прочитай цей файл**. Це список компонентів і поведінок які мусять існувати, бо інакше дашборд стає неправильним або ламається UX-логіка.
>
> **Чому це важливо:** 2026-05-07 у комміті `0767809` («Strip remaining mocks») я (Claude) знищив 5 архітектурних компонентів які користувач довго проектувала з Сашею — і користувач помітила це лише через тиждень коли вже накопичились зміни. Відновлення зайняло ~6 годин. Цей файл щоб повторно так не вийшло.

---

## 1. Обов'язкові файли (НЕ видаляти без обговорення)

### Дашборди — компоненти структури

| Файл | Призначення | Хто рендерить |
|---|---|---|
| [src/components/dashboard/manager-dashboard.tsx](../src/components/dashboard/manager-dashboard.tsx) | Дашборд менеджера: hero metrics + 9 BrandRow + ClientStatsCard | role=manager, drill-down з РМ/Director, «Моє планування» з РМ |
| [src/components/dashboard/rm-dashboard.tsx](../src/components/dashboard/rm-dashboard.tsx) | Дашборд РМ: hero + 2 блоки (ManagerAccordion + BrandManagerGroup) | role=rm |
| [src/components/dashboard/director-dashboard.tsx](../src/components/dashboard/director-dashboard.tsx) | Дашборд Директора: hero + 2 блоки (RegionAccordion + BrandRegionGroup) | role=director |

### Дашборди — building blocks

| Файл | Призначення |
|---|---|
| [src/components/dashboard/brand-row.tsx](../src/components/dashboard/brand-row.tsx) | Універсальний рядок бренду — використовується скрізь (Manager/RM/Director) |
| [src/components/dashboard/region-accordion.tsx](../src/components/dashboard/region-accordion.tsx) | Картка регіону на Director: тап → expand → 9 BrandRow + manager mini-list + drill-down icon |
| [src/components/dashboard/manager-accordion.tsx](../src/components/dashboard/manager-accordion.tsx) | Картка менеджера на РМ: тап → expand → 9 BrandRow (клікабельні → planning brand×manager) |
| [src/components/dashboard/brand-region-group.tsx](../src/components/dashboard/brand-region-group.tsx) | Cross-grouping для Director: бренд → expand → регіони → expand → менеджери |
| [src/components/dashboard/brand-manager-group.tsx](../src/components/dashboard/brand-manager-group.tsx) | Cross-grouping для РМ: бренд → expand → менеджери (клік → planning brand×manager) |
| [src/components/dashboard/brand-expanded-details.tsx](../src/components/dashboard/brand-expanded-details.tsx) | Variant A: розгортання BrandRow на Manager → 4 client-category cards + Незаплановані з sub-rows |
| [src/components/dashboard/client-stats-card.tsx](../src/components/dashboard/client-stats-card.tsx) | 4-та hero-картка: Активні / Сплячі / Нові + Всього купили |
| [src/components/dashboard/dashboard-skeleton.tsx](../src/components/dashboard/dashboard-skeleton.tsx) | Skeleton при першому завантаженні дашборду |
| [src/components/dashboard/metric-card.tsx](../src/components/dashboard/metric-card.tsx) | Універсальна метрик-картка (План / Факт / Виконання) |

### Lib — критичні helpers

| Файл | Призначення |
|---|---|
| [src/lib/onec-adapters.ts](../src/lib/onec-adapters.ts) | Адаптери 1С → UI: adaptLogin, adaptClientsForPlanning, adaptSalesFact, adaptRegistryPlans, adaptRegionData. Фільтр архівних регіонів і неактивних менеджерів. |
| [src/lib/region-aggregates.ts](../src/lib/region-aggregates.ts) | aggregateRegion / aggregateManagers / aggregateCompany — підсумки по регіону/менеджерах/компанії з Action 5 |
| [src/lib/unplanned-buyers.ts](../src/lib/unplanned-buyers.ts) | Cross-reference Action 2 + Action 3: знайти «незапланованих покупців» по сегменту, групувати по категоріях |
| [src/lib/use-clients-aggregate.ts](../src/lib/use-clients-aggregate.ts) | Паралельні Action 2 → агрегат для ClientStatsCard. **Видалимо коли 1С здасть v2.5 з clientStats у Action 5.** |
| [src/lib/use-onec-data.ts](../src/lib/use-onec-data.ts) | SWR-обгортка над callOneC — кеш per (action, payload) |
| [src/lib/session.ts](../src/lib/session.ts) | JWT cookie session — sign/verify/clear. SESSION_SECRET env обов'язкова на prod. |
| [src/lib/rate-limit.ts](../src/lib/rate-limit.ts) | In-memory rate limit для /api/onec + /api/auth/login |
| [src/lib/login-to-user-id.ts](../src/lib/login-to-user-id.ts) | Стабільний хеш login → number ID для FK у Supabase. Lower-case + trim перед хешем. |
| [src/lib/working-days.ts](../src/lib/working-days.ts) | Робочі дні України — свята 2026 (3 шт). 2027 порожньо — заповнити перед 31.12.2026. |

### API routes (НЕ видаляти)

- `src/app/api/auth/login/route.ts` — login прокі до 1С + JWT cookie
- `src/app/api/auth/logout/route.ts` — clear cookie
- `src/app/api/auth/me/route.ts` — поточна сесія
- `src/app/api/onec/route.ts` — прокі до 1С з whitelist + rate-limit + session check
- `src/app/api/planning/route.ts` — UPSERT/DELETE/GET у Supabase
- `src/app/api/archive/route.ts` — архівування

---

## 2. Обов'язкові поведінки (UX-логіка)

### Дашборди

- **Manager dashboard** — клік на BrandRow = expand → 4 client cards + Незаплановані. Кнопка «Перейти у форму →» = drill-down у PlanningForm.
- **RM dashboard** — TWO блоки: «Менеджери регіону» (ManagerAccordion: тап → 9 BrandRow клікабельних → planning brand×manager) + «По брендах — з розбивкою по менеджерах» (BrandManagerGroup).
- **Director dashboard** — TWO блоки: «Регіони» (RegionAccordion: тап → 9 BrandRow + manager mini-list клікабельний) + «По брендах — з розбивкою по регіонах» (BrandRegionGroup: тап на бренді → регіони → expand region → менеджери клікабельні).
- **Drill-down chain працює:**
  - Director → RegionAccordion mini-list → ManagerDashboard self-or-other (одним кліком)
  - Director → RegionAccordion drill-down icon → RMDashboard
  - Director → BrandRegionGroup → region → expand → manager → PlanningForm brand×manager
  - RM → ManagerAccordion → drill-down icon → ManagerDashboard
  - RM → ManagerAccordion expand → BrandRow клік → PlanningForm brand×manager
  - RM → BrandManagerGroup → manager → PlanningForm brand×manager

### Self-edit
- Якщо РМ клікає СЕБЕ у списку менеджерів регіону → план редагований (не readOnly). Перевірка: `targetUserLogin !== user.login` у ManagerDashboard.

### Period filter
- Усі дашборди передають `asOfDate = currentPeriod.weekEnd` (filter mode) АБО `today` (live mode).
- Усі дашборди парсять weekEnd вручну `[y, m, d] = split('-').map(Number)` (НЕ `new Date(string)` — UTC bug).
- «Весь місяць» button у PeriodFilter будує `monthEnd` вручну (НЕ `toISOString().split('T')[0]` — UTC bug).

### Active vs Inactive по бренду
- **Прогноз по активних клієнтах** = клієнти з останньою покупкою цього бренду за **останні 90 днів** (НЕ 1С-категорія `category === 'active'`).
- **Закриття розриву** = клієнти з покупкою цього бренду раніше ніж 90 днів тому.
- 1С-категорія використовується тільки як інформативний chip у gap-картках.

### Hero ClientStatsCard
- На РМ/Director — 4-та картка показує агрегат клієнтів регіону/компанії.
- Зараз через паралельні Action 2 (`useClientsAggregate`). Після 1С v2.5 → читати з `aggregate.clientStats`.

### Аутентифікація
- HttpOnly cookie `sp_session` (JWT з jose). На prod обов'язково SESSION_SECRET env.
- `/api/onec` whitelist actions + Director може викликати з будь-яким login (інші ролі — тільки свій + managedUsers).
- Bootstrap сесії у root layout через `<SessionBootstrap>`.

### Архітектурні фільтри
- **Архівні підрозділи** (Лазерхауз*, Полтава*, Чернівці*, Адасса, Коллцентр) — фільтруються в адаптері `adaptRegionData` через `isActiveDivision`.
- **Менеджери без жодних показників** (план/факт/prev = 0) — фільтруються у адаптері (Хамуляк-style hide).
- **Менеджери без current активності** — приховуємо у display (mini-list / regional manager list), АЛЕ їх prev-history лишається у регіональному агрегаті.

---

## 3. Перш ніж зробити «cleanup» — checklist

Якщо PR/коміт ВИДАЛЯЄ або ПЕРЕЙМЕНОВУЄ файли з розділів 1-2:

- [ ] Прочитав цей файл і пам'ятаю чому ці компоненти існують
- [ ] Замість видалення — чи можу `@deprecated` JSDoc + reuse?
- [ ] Якщо точно треба видалити — оновлюю цей doc + memory + повідомляю користувача
- [ ] Тестую усі 4 ролі вручну: manager / rm / director / drill-down chains
- [ ] Перевіряю всі поведінки з розділу 2 (особливо drill-down chains)
- [ ] Запускаю `npm run qa` (Playwright headed) щоб переконатись що сценарії не зламались

Якщо PR/коміт МІНЯЄ логіку:
- [ ] Active/Inactive по бренду = 90 днів (НЕ 1С category)
- [ ] Period filter = currentPeriod.weekEnd (НЕ end of month)
- [ ] Дати парсяться вручну (НЕ через `new Date(string)`)
- [ ] Self-edit (РМ клікає себе) лишається editable

---

## 4. Команди для швидкого аудиту

```bash
# TSC + lint
npx tsc --noEmit && npm run lint

# Build (full)
npm run build

# Перевірити що ключові файли існують
for f in src/components/dashboard/{region,brand-region-group,manager-accordion,brand-manager-group,brand-expanded-details,client-stats-card}.tsx src/lib/{region-aggregates,unplanned-buyers,use-clients-aggregate,session}.ts; do
  [ -f "$f" ] && echo "✅ $f" || echo "❌ MISSING: $f"
done

# Перевірити що ключові експорти присутні
grep -l "export function RegionAccordion" src/components/dashboard/region-accordion.tsx
grep -l "export function BrandRegionGroup" src/components/dashboard/brand-region-group.tsx
grep -l "export function ManagerAccordion" src/components/dashboard/manager-accordion.tsx
grep -l "export function BrandManagerGroup" src/components/dashboard/brand-manager-group.tsx
```

---

## 5. Memory references

- [stakeholders.md](../../../.claude/projects/c--Users-itd-Projects-apps-sales-planning/memory/stakeholders.md) — користувач + Саша (Дир.продажів) + 1С-розробник
- [active_vs_inactive_brand_rule.md](../../../.claude/projects/c--Users-itd-Projects-apps-sales-planning/memory/active_vs_inactive_brand_rule.md) — правило 3 місяці
- [supabase_schema.md](../../../.claude/projects/c--Users-itd-Projects-apps-sales-planning/memory/supabase_schema.md) — реальна схема БД
- [known_issue_action5_prev_month.md](../../../.claude/projects/c--Users-itd-Projects-apps-sales-planning/memory/known_issue_action5_prev_month.md) — Action 5 cross-region баг (чекаємо фіксу 1С)
- [ux_action_buttons_label.md](../../../.claude/projects/c--Users-itd-Projects-apps-sales-planning/memory/ux_action_buttons_label.md) — toggle-кнопки підписувати дією, не станом

---

## 6. Версія документу

- **2026-05-08** — створено після Day 9. Покриває стан після відновлення архітектури 0767809→ec81eed.
- Оновлювати при суттєвих змінах архітектури (нові ролі, нові дашборди, нові accordion-патерни).
