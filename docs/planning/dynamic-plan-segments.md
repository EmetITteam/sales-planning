# Dynamic Plan Segments — plan=fact дзеркально

**Дата:** 2026-07-01
**Автор:** ITD EMET
**Статус:** ✅ у проді
**Пов'язано:** ADR-18, [`PROJECT_PLAN.md`](../PROJECT_PLAN.md)
**Перший юз-кейс:** NEURONOX (обмежений залишок товару)

---

## 1. Проблема

По окремих брендах 1С виставляє план продажів, але фізичний залишок товару на складі не дозволяє його виконати (обмежений імпорт, закінчилось виробництво, тимчасова дефіцитність). Приклад: **NEURONOX** — план $10K, реальний залишок дозволяє продати $400.

Раніше система показувала виконання = $400 / $10K = **4%** — менеджера, регіон і компанію штрафувало за проблему, на яку менеджер не впливає.

## 2. Рішення

Введено концепцію **динамічного плану** для конкретного сегмента: `plan = fact` дзеркально. Виконання по такому бренду завжди 100%. По ньому менеджер **НЕ планується по клієнтах** (не заповнює Прогноз / Закриття розриву).

Правило прив'язане до **сегмента + дати «з»** (опційно «до»). Історія за попередні місяці не змінюється — тільки поточний і майбутні місяці бачать динамічну заміну.

Керує admin через `/admin/dynamic-plans`.

---

## 3. Що змінюється у UI

### 3.1 Менеджерська форма планування (bar) — коли обраний сегмент dynamic
- Breadcrumb: emerald-бейдж **«ДИНАМІЧНИЙ ПЛАН»**
- 4 hero-метрики (План/Очікуване/Факт/Відхилення) — план=факт, %=100%, відхилення 0%
- Пояснювальна картка вгорі: *«По цьому бренду не плануємось по клієнтах. План = факт автоматично — тобто % виконання завжди 100%. Прогноз і закриття розриву заповнювати не потрібно.»*
- **Приховано:** таблиця «Дані по клієнтах по ТМ», секція «Прогноз по активних клієнтах», секція «Закриття розриву», блок «Дії для закриття розриву»
- Save-bar лишається (Зберегти чернетку / Фінальне збереження)

### 3.2 BrandRow (у всіх дашбордах)
Для dynamic-бренду:
- Emerald pill-бейдж «Динамічний план» замість світлофора
- Виконання 100% (без відхилення +/-%)
- Прогрес-бар повний, без насічок «Прогноз (темп)» / «Запл.»
- Прибрано підпис «Прогноз (темп): X% · Запл.: Y%» під баром

### 3.3 Hero-картки «План» — Manager / RM / Director / Company Overview

Формула effective plan:

```
plan_effective = Σ non-dynamic 1С-plans + Σ dynamic facts
```

Тобто у сумі плану **не додається** 1С-план по dynamic-сегменту, а натомість додається **поточний факт** по ньому.

Приклад для регіону:
```
non-dynamic:   1С-план = $50,000, факт = $40,000
NEURONOX:      1С-план = $10,000, факт = $400
──────────────────────────────────────────
показуємо:     План = $50,400, Факт = $40,400, %  = 80.16%
(замість): $60,000 план, 67.3% ← було штрафом
```

Під сумою effective плану — маленький рядок:
> **З 1С (з динамічним): $60,000**

Показується лише коли є diff (dynamicSegments > 0 + різниця > $0.5). У місяцях без dynamic — цей рядок не з'являється.

### 3.4 Company Overview — тільки Представництва
Effective план у Company Overview застосовується **лише** до підрозділів з `groupKey === 'representations'`. Колл-центр / Адасса / Лазерхауз / дистрибутори мають іншу модель обліку — для них 1С-план залишається як є.

### 3.5 PlanningReadinessCard (Director)
Готовність планування рахує знаменник **без dynamic-брендів**. Тобто якщо активний 1 dynamic-сегмент, менеджер має закрити 8 з 9 брендів для стану «finalized» — dynamic не блокує готовність команди.

Текст «усі 9 брендів закрито» → «усі 8 брендів закрито».

---

## 4. Архітектура

### 4.1 База даних

**Таблиця** `dynamic_plan_segments` (migration `20260701_026_dynamic_plan_segments.sql`):

| Колонка | Тип | Значення |
|---|---|---|
| id | uuid | pk |
| segment_code | text | напр. `'NEURONOX'` |
| enabled_from | date | `'2026-07-01'` — правило діє з цієї дати |
| enabled_to | date? | NULL = безстроково |
| strategy | text | `'mirror_fact'` (плейсхолдер під майбутні стратегії) |
| reason | text? | опц. «обмежений залишок товару» |
| created_by | text | admin login |
| created_at | timestamptz | auto |

**RLS deny-all** — читає тільки backend через service_role.

**Індекси:** `(segment_code)` + `(enabled_from, enabled_to)`.

**Constraint:** `enabled_to IS NULL OR enabled_to >= enabled_from`.

Rollback у `20260701_026_dynamic_plan_segments_rollback.sql`.

### 4.2 Backend

**Файл:** `src/lib/dynamic-plan-segments.ts`

Публічні функції:
- `getActiveDynamicSegments(periodMonth)` → `{ segmentCodes: Set<string>, rules: Rule[] }`
  - Правило вважається активним якщо `enabled_from ≤ 1-число_місяця AND (enabled_to IS NULL OR enabled_to ≥ 1-число_місяця)`
  - 60-секундний in-memory кеш per `YYYY-MM` ключ
- `getAllDynamicSegments()` — список усіх правил (для admin listing)
- `createDynamicSegment(input)` — insert
- `deactivateDynamicSegment(id)` — soft: `enabled_to = today` (поточний місяць лишається дзеркальним, з завтра — ні)
- `deleteDynamicSegment(id)` — hard delete (для випадкових помилок)

### 4.3 API endpoints

| Метод | Endpoint | Хто | Що робить |
|---|---|---|---|
| GET | `/api/admin/dynamic-plans` | admin only | Список усіх правил |
| POST | `/api/admin/dynamic-plans` | admin only | Створити правило (валідація segment_code, дат) |
| PATCH | `/api/admin/dynamic-plans` | admin only | Body `{id, action: 'deactivate'}` — м'яка деактивація |
| DELETE | `/api/admin/dynamic-plans?id=...` | admin only | Hard delete |
| GET | `/api/dynamic-plans/active?period=YYYY-MM` | auth | Список активних segment_code для періоду |

Всі admin-роути gated через `isAdminLogin(session.login)` (тільки `itd@emet.in.ua`).

### 4.4 Frontend hook

**Файл:** `src/lib/use-dynamic-plan-segments.ts`

```tsx
const { dynamicSegments } = useDynamicPlanSegments(currentPeriod.month);
// dynamicSegments: Set<string>
// Використання: dynamicSegments.has('NEURONOX')
```

SWR-кеш: `dedupingInterval: 60_000`, ключ `dynamic-plans-active|YYYY-MM`.

### 4.5 Admin UI

**Файл:** `src/app/admin/dynamic-plans/page.tsx`

- Список правил з бейджами «активне» / «неактивне»
- Форма створення: select сегмента + дата «З» (default 1-е число поточного місяця) + опц. «До» + опц. причина
- Кнопки Деактивувати (soft) + Видалити (hard) з confirm-діалогами
- Тільки для `role === 'admin'`, інакше redirect на `/`

Access через `/admin` → картка «Динамічні плани».

---

## 5. Виконання регіону / компанії — коректність %

Для одиничного dynamic-сегмента: plan = fact = X → **100%** завжди.

Для агрегата (регіон/компанія):
```
non-dynamic:    plan=$50K, fact=$40K → 80%
dynamic:        plan=$400, fact=$400 → 100%
weighted:       plan=$50.4K, fact=$40.4K → 80.16%
```

Dynamic-сегмент додає **однакову суму** у чисельник і знаменник, тому «підтягує» середнє до 100% пропорційно своєму розміру. Оскільки dynamic-сегмент зазвичай малий (обмежений залишок), його вплив на загальний % мінімальний — регіон рахується практично суто по non-dynamic-брендах, як і треба.

Реалізація у коді:
- `manager-dashboard.tsx`: `totalPlan = summaries.reduce(...)` де кожен summary має `planAmount = isDynamicPlan ? factAmount : 1С-план`
- `rm-dashboard.tsx`: `useMemo(() => Σ aggregate.segments з override, ...)` — над early returns
- `director-dashboard.tsx`: те саме через `company.segments`
- `region-accordion.tsx`: `effectiveTotalPlan` — replace `aggregate.totalPlan` у всьому компоненті
- `company-overview-dashboard.tsx`: у `filteredTotalPlan` + `filteredActivePlan` — тільки для `groupKey === 'representations'`

---

## 6. Файли (checklist для code review)

**Нові:**
- `supabase/migrations/20260701_026_dynamic_plan_segments.sql`
- `supabase/migrations/20260701_026_dynamic_plan_segments_rollback.sql`
- `src/lib/dynamic-plan-segments.ts`
- `src/lib/use-dynamic-plan-segments.ts`
- `src/app/api/admin/dynamic-plans/route.ts`
- `src/app/api/dynamic-plans/active/route.ts`
- `src/app/admin/dynamic-plans/page.tsx`
- `docs/planning/dynamic-plan-segments.md` (цей файл)

**Змінені:**
- `src/lib/supabase.ts` — додано `.lte()` / `.gte()` методи
- `src/lib/types.ts` — `TMSummaryCard.isDynamicPlan?: boolean`
- `src/components/dashboard/brand-row.tsx` — badge + прибрано forecast/dev/expected для dynamic
- `src/components/dashboard/manager-dashboard.tsx` — override planAmount + `rawTotalPlan1c` для hint
- `src/components/dashboard/rm-dashboard.tsx` — те саме через aggregate
- `src/components/dashboard/director-dashboard.tsx` — через company
- `src/components/dashboard/company-overview-dashboard.tsx` — тільки для representations
- `src/components/dashboard/region-accordion.tsx` — effectiveTotalPlan
- `src/components/dashboard/brand-region-group.tsx` — прокидання dynamicSegments
- `src/components/dashboard/brand-manager-group.tsx` — те саме
- `src/components/dashboard/manager-accordion.tsx` — те саме
- `src/components/dashboard/planning-readiness-card.tsx` — виключення dynamic зі знаменника готовності
- `src/components/planning/planning-form.tsx` — hook + hide sections + explainer card
- `src/components/planning/sections/planning-save-bar.tsx` — pill-style кнопки, прибрано підкладку
- `src/app/admin/page.tsx` — новий пункт «Динамічні плани»

---

## 7. Commits у master

```
e110991 feat(dynamic-plans): mirror plan=fact for selected segments (NEURONOX etc)
b72f54c fix(dynamic-plans): hide forecast+dev+plan-mark for dynamic segments in BrandRow
c4308c1 fix(dynamic-plans): reorder explainer above client stats, rewrite copy, pill save buttons
c90c159 fix(dynamic-plans): exclude dynamic segments from planning readiness count
cc4b2e5 fix(dynamic-plans): recalc effective plan totals excluding 1С plans for dynamic segments
00e3617 fix(dynamic-plans): move totalPlan useMemo above early returns (React #310)
bb11a87 feat(dynamic-plans): show original 1С plan on hero cards when dynamic active
6df1691 fix(dynamic-plans): hide ClientDataByTmSection for dynamic segments
d02c2a0 fix(planning): remove white sticky bar under save buttons
```

---

## 8. Юз-кейс NEURONOX — як admin вмикає

1. Admin (itd@emet.in.ua) → `/admin/dynamic-plans`
2. «Нове правило» → сегмент **Neuronox**, з дати **2026-07-01**, «До» лишити порожнім, причина: «обмежений залишок товару»
3. Створити → з завтрашнього ранку (60с кеш) усі дашборди + форма планування по NEURONOX працюють у dynamic-режимі
4. Історія за червень 2026 та раніше залишається недоторканою — реальні плани 1С

## 9. Як вимкнути

- **М'яко (Деактивувати):** `enabled_to = today`. Поточний місяць лишається дзеркальним (щоб не ламати вже накопичений факт), з завтра правило перестає діяти.
- **Жорстко (Видалити):** правило зникає з БД. Місяці до сьогодні у яких правило діяло — все одно показують історичну картину з 1С-фактом, але дашборди на майбутнє одразу почнуть показувати оригінальний 1С-план.

Історія (skрхіни / експорти) не переписується автоматично — це in-memory обчислення на льоту.

---

## 10. Майбутнє — можливі розширення

- **Інші стратегії:** зараз `strategy = 'mirror_fact'`. Можна додати `'fixed_ratio'` (plan = 30% від 1С-плану) або `'user_defined'` (admin вручну ставить план).
- **Per-manager overrides:** якщо потрібно щоб dynamic діяв тільки для конкретного менеджера. Наразі — глобально для всієї компанії.
- **Notification при активації:** email/telegram admin коли зміни у правилах. Наразі — тільки console.log.
- **Audit trail:** зараз є `created_by` + `created_at`. Не пишемо hard-delete у audit — це майбутнє покращення якщо треба compliance.
