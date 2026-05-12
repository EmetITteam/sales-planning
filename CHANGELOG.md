# Changelog

Усі помітні зміни Sales Planning. Формат за [Keep a Changelog](https://keepachangelog.com/).

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
