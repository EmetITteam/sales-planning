# Architecture Rules — Sales Planning

Цей документ — обов'язковий read для будь-кого хто пише код у проекті. Правила
codified у `scripts/architecture-check.mjs` і прогоняються у `npm run prepush`.

Створено 2026-06-17 після refactor sprint що розбив 2 god-components
(`clients-page.tsx` 2869 LOC → 890 + 19 файлів, `planning-form.tsx` 2403 LOC
→ 1231 + 10 файлів).

---

## File size limits

| Cap | LOC | Behavior |
|-----|-----|----------|
| **Soft** | 500 | `prepush` показує warning. Push проходить. |
| **Hard** | 800 | `prepush` failed. Файл МАЄ бути розбитий перш ніж merge. |

**Винятки:** `EXEMPT_LARGE_FILES` у `scripts/architecture-check.mjs`. Додавати
ОБЕРЕЖНО — кожен виняток коментувати ЧОМУ + плани на refactor.

**Чому ці числа:** `clients-page.tsx` виріс +55% (1855 → 2869 LOC) за 2 тижні
коли ми вносили Sprint 2C/2D. Soft cap 500 ловить ранній стан god-component-а.
Hard cap 800 не дає push без розбиття.

---

## Decomposition principles (SOLID-lite для React)

### 1. Один файл = одна відповідальність
- Hero/Filters/List/Expand/Dialogs — окремі файли якщо разом > 400 LOC
- НЕ змішувати inline subcomponents > 50 LOC у одному файлі

### 2. Pure helpers → `*-helpers.ts`
- Без JSX, без React, без side-effects
- Тестується юніт-тестами без jsdom (`tsx --test`)

### 3. Custom hooks → `use-*.ts`
- Один hook = один файл
- Якщо хук > 200 LOC — розбити на менші

### 4. Sub-components inline лише якщо < 50 LOC
- Локальний компонент 50+ LOC у parent → виносити

### 5. Props drilling > 3 рівнів = переглянути архітектуру
- Або React Context, або композиція через children, або render-props

### 6. Types → `*-types.ts` якщо > 5 інтерфейсів
- Інакше — поруч з компонентом

---

## Folder structure для feature-модуля

```
src/components/<feature>/
├── <feature>-page.tsx          ← orchestrator (state, data fetch, composition)
├── <feature>-helpers.ts        ← pure-функції + константи + типи
├── <feature>-dialogs.tsx       ← всі модалки разом (якщо їх 2+)
├── sections/                   ← великі логічні блоки render-у
│   ├── <name>-section.tsx
│   └── ...
├── hooks/                      ← custom hooks
│   ├── use-<feature>-state.ts
│   ├── use-<feature>-save.ts
│   └── use-<feature>-load.ts
└── shared/                     ← маленькі reusable cells (NumCol, PctCol)
    └── <name>.tsx
```

**Приклади у repo:**
- [`src/components/clients/`](../src/components/clients/) — 25 файлів (helpers + shared + 5 hero + 2 filters + 3 list + 6 expand)
- [`src/components/planning/`](../src/components/planning/) — 10 файлів (helpers + dialogs + 5 sections + 3 hooks)

---

## При додаванні фічі

✅ **Робити:**
1. Якщо нова фіча додає > 200 LOC у існуючий файл — СТВОРИТИ sub-file у `sections/`
2. Якщо потрібен новий prop через 3+ рівні — переглянути архітектуру
3. Перед PR: `npm run check:arch` — 0 warnings для **нових** файлів
4. Pure-functions extracted → 1+ unit test одразу

❌ **НЕ робити:**
1. НЕ розширювати `EXEMPT_LARGE_FILES` без обговорення з власником проекту
2. НЕ копіювати render-логіку (DRY) — створити shared component у `shared/`
3. НЕ змішувати state + render-helpers + dialogs в одному файлі

---

## Тестова стратегія

**3 рівні (поточний стан проекту):**

| Рівень | Тулз | Що тестує | Папка |
|--------|------|-----------|-------|
| Unit | `tsx --test` | Pure-функції, business logic | `tests/*.test.ts` |
| Component | Vitest + RTL + jsdom | UI behavior, props rendering | `tests/components/*.test.tsx` |
| E2E | Playwright (headed) | Critical flows, regressions | `scripts/qa-review.mjs` |

**Запуск:**
```bash
npm run test            # unit (355 tests)
npm run test:components # vitest component (12 tests)
npm run qa              # Playwright headed (manual flows)
npm run check:arch      # invariants + LOC gates
npm run prepush         # все вище + tsc
```

**При витягуванні pure-функції** — обов'язково додати unit-test одразу.
Приклад: [`tests/planning-helpers.test.ts`](../tests/planning-helpers.test.ts).

**При витягуванні UI-компонента** — додати component test з покриттям
основних станів (loading / empty / data / interaction).
Приклад: [`tests/components/planning-metrics-row.test.tsx`](../tests/components/planning-metrics-row.test.tsx).

---

## Що ловить `npm run check:arch`

1. **REQUIRED_FILES** — критичні файли мусять існувати
2. **REQUIRED_EXPORTS** — критичні exports мусять бути присутні
3. **REQUIRED_USAGES** — дашборди мусять використовувати ключові компоненти
4. **ANTI_PATTERNS** — заборонені регекс-патерни (UTC bug, 1С category mis-use)
5. **LOC gates** — soft 500 (warn) / hard 800 (error)

Зміни до перевірок — у `scripts/architecture-check.mjs`.

---

## Roadmap (наступні refactor цілі)

Файли > soft cap 500 LOC, в порядку пріоритету:

| File | LOC | Причина високої LOC | Рекомендований підхід |
|------|-----|---------------------|----------------------|
| `dashboard/company-overview-dashboard.tsx` | 1265 | Велика товста сторінка з 4 hero + table | Винести Hero у `hero/`, винести table у `company-stats-table.tsx` |
| `clients-page.tsx` | 890 | State orchestrator після Day 5 refactor | Винести fact-enrichment useEffect у `hooks/use-client-fact-sync.ts` |
| `planning-form.tsx` | 1231 | State orchestrator після Day 8 refactor | Винести handlers (updateForecast/updateGap/addClient) у `hooks/use-planning-crud.ts` |
| `dashboard/manager-dashboard.tsx` | 622 | Несекційований render | Розбити на `dashboard-hero` + `dashboard-brands` |
| `claims/claim-detail-view.tsx` | 611 | Inline meeting/notes/timeline subcomponents | Винести у `claims/sections/` |
| `meetings/meeting-card.tsx` | 581 | Все ще монолітна | Винести footer/header у sub-components |
| `meetings/meeting-form.tsx` | 578 | Велика форма з 3+ tabs | Винести tabs у `meetings/sections/` |
| `meetings/meetings-dashboard.tsx` | 549 | Filter + list разом | Винести filter у `meetings/filters/` |
| `dashboard/director-dashboard.tsx` | 545 | Несекційований | Як manager-dashboard |
| `dashboard/rm-dashboard.tsx` | 534 | Несекційований | Як manager-dashboard |
| `claims/claim-form-dialog.tsx` | 598 | Велика форма | Винести fields у `claims/form-fields/` |

**Принцип «boy scout rule»:** коли торкаєшся файлу > soft cap — заодно винести
хоча б одну логічну частину. Не хапати все одразу.

---

## Як обходити правило (коли реально треба)

1. Додати файл у `EXEMPT_LARGE_FILES` з коментарем чому + плани на refactor
2. У PR description пояснити trade-off
3. Створити task у backlog на майбутнє розбиття

⚠️ Тільки maintainer проекту може додавати до `EXEMPT_LARGE_FILES` без узгодження.
