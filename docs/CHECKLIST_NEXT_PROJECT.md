# Чек-ліст для наступних проектів EMET

Зведений post-mortem з 2-3 тижнів роботи над `sales-planning` (квітень-травень 2026). Кожен пункт — реальний bug або переробка, яких 5-10 ітерацій із втратою часу. У наступному проекті перевіряти **перед стартом** і **під час** розробки.

---

## 🗄️ Бекенд / База даних

### Backup ПЕРЕД будь-якою DDL міграцією
- ❌ Supabase Free plan **не має** auto-backups. Не покладатись на дашборд.
- ✅ Запускати `node scripts/backup-supabase.mjs` перед `CREATE/ALTER/DROP TABLE`.
- ✅ Бекап-скрипт має виводити row counts усіх таблиць у JSON у `backups/YYYY-MM-DD/`.
- ✅ Robomо graceful skip 404 — скрипт не падає якщо таблиця ще не існує.
- ✅ При додаванні нової таблиці одразу долучити її у TABLES масив бекап-скрипта.

### Безпека endpoint-ів — НЕ забути role='director' окремо
- ❌ Кожен `if (login !== session.login && !session.managedUsers.includes(login))` БЛОКУЄ Director-а у 5+ місцях. У session.managedUsers тільки прямі підлеглі (4 РМ), а директор має доступ до всіх 21 менеджера.
- ✅ Шаблон правильної перевірки:
  ```ts
  if (effectiveLogin !== session.login
      && session.role !== 'director'
      && !session.managedUsers.includes(effectiveLogin)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  ```
- ✅ Перевіряти: GET planning, POST planning, init-snapshot, region-stats, planning/aggregate.

### `Vercel maxDuration` для важких endpoint-ів
- ❌ За замовчуванням 10s — Hobby plan kill-ить функцію без логу → 500.
- ✅ Для будь-якого endpoint що б'є по 1С батчем (Action 2/3/5 для N менеджерів) одразу ставити:
  ```ts
  export const maxDuration = 60;
  ```
- ✅ Pro plan дозволяє до 60с, цього вистачає для concurrency-обмеженого батчу.

### Concurrency limit на 1С виклики
- ❌ 21 менеджер × 2 виклики = 42 паралельні запити в 1С → перевантаження → 30% data loss.
- ✅ Батчити максимум 5 паралельних викликів через простий semaphore:
  ```ts
  for (let i = 0; i < items.length; i += LIMIT) {
    const batch = items.slice(i, i + LIMIT);
    results.push(...await Promise.all(batch.map(fetchOne)));
  }
  ```
- ✅ Додати один retry з невеликою затримкою на transient помилки.

### `safety guard` на DELETE notIn() при пустому списку
- ⚠️ Backend пропускає DELETE коли `keepIds=[]` без явного `clearAll: true`. Це захист від race з порожнім state ДО завантаження, але:
- ✅ Frontend ОБОВ'ЯЗКОВО передає `clearAll: true` коли форма раніше редагувалась (`formEverEdited` АБО є persisted дані). Без цього видалені рядки лишаються в БД назавжди.

### Snapshot для аудиту
- ✅ Якщо UI має DELETE-операції що змінюють user-data — підтримувати snapshot-таблицю:
  - PRIMARY KEY включає `block_type` (forecast/gap)
  - `INSERT ... ON CONFLICT DO NOTHING` гарантує fix-once
  - Backfill-script для імпорту snapshot ретроспективно
- ✅ Snapshot ніколи не оновлюється — тільки створюється раз. UI його не показує.

---

## 🎯 Семантика метрик — узгоджувати з користувачем ОДИН раз

### Назвати чітко що це означає
- ❌ Тричі переписували класифікацію buyer-ів:
  1. По 1С-полю `category` (active/sleeping/lost) — НЕ працювало бо це глобальна оцінка клієнта, не per-brand
  2. По `lastPurchaseDate` (3-міс правило) — НЕ працювало бо buyer цього місяця завжди свіжий
  3. **По плану менеджера (forecast/gap)** — фінальне ✓
- ✅ ЗАВЖДИ перевіряти з користувачем ДО написання коду: «коли менеджер бачить категорію, це означає X. Підтверджуєш?»

### Формули мають бути узгоджені скрізь
- ❌ «Запланований %» рахувався двома різними формулами:
  - Дашборд: `(факт + план) / planMonth × 100`
  - Форма: `план / planMonth × 100`
  - Різниця 14% заплутала користувача
- ✅ Перш ніж писати другу копію формули — винести у helper `src/lib/metrics.ts` з докладним коментарем семантики.

### Dedup — реальність складніша за теорію
- ❌ «1 клієнт = 1 менеджер» — теоретично. На практиці бувають переходи / тимчасові підмінки.
- ✅ Завжди тримати `Set<key>` для dedup при агрегації. Експортувати meta-стат (`skippedCount`, `examples`) для прозорості.
- ✅ Менеджер може бути в двох регіонах легітимно (Пашковська). Dedup логінів — норма, не баг.

---

## ⚛️ Frontend / React

### Hooks ВИЩЕ early returns (React error #310)
- ❌ Додавати `useMemo`/`useState`/`useEffect` після `if (view==='X') return ...` ламає компонент при перемиканні view.
- ✅ ВСІ хуки ВГОРІ компонента, перед першим `return`. Завжди.

### SWR cache key мусить розрізняти стани
- ❌ `key = ids.length > 0 ? 'p' + len : 'np'` колапсує `null` і `[]` в один ключ → стара відповідь з кешу замість нового запиту.
- ✅ Розрізняти 3 стани:
  ```ts
  const planHash = !ids ? 'np' : ids.length === 0 ? 'pe' : `p${ids.length}`;
  ```
- ✅ Тестувати: чи перезапит йде коли передається `null` → `[]` → `[ids]`.

### Auto-populate guard через persistence-маркер
- ❌ Auto-populate useEffect re-fires коли `state.length === 0` → видалені user-ом клієнти ВІДРАЗУ повертаються.
- ✅ Маркер `formEverEdited`:
  - `true` коли load повертає persisted data (`summary !== null`)
  - `true` ВІДРАЗУ при confirmDelete (single + bulk) — НЕ чекати save
  - `true` після успішного save
  - Auto-populate skip коли `formEverEdited === true`

### Selection state з Set<index> ЛАМАЄТЬСЯ при single-delete
- ❌ Якщо selectedIds = `Set<number>` (по index у масиві), то single-delete з середини зсуває індекси наступних → bulk-delete видаляє НЕ ТИХ.
- ✅ ЗАВЖДИ:
  - Або тримати `Set<string>` за стабільним id (`clientId1c`)
  - Або синхронізувати при single-delete: `syncIndicesAfterRemove(prev, removedIdx)`
- ✅ Винести у pure-функцію `src/lib/selection-sync.ts` + тести.

### Per-row data sync з batch-API
- ❌ Якщо bulk endpoint (Action 3) повертає `clients[].factAmount` — а форма додає рядки через окремий шлях, поле залишається 0.
- ✅ useEffect що при зміні factResponse будує `Map<id, value>` і MERG-ить у state-rows. Заодно перераховує derived поля (`completed`).

### `hasManagerPlan: false` не залишати як TODO
- ❌ Прокидаєш bool prop, ставиш `false` з коментарем «зробимо потім» → залишається назавжди.
- ✅ Якщо немає даних — або не показувати UI взагалі, або обчислити одразу. Не writable-TODO.

### Navigation persistence для refresh
- ❌ Користувач на формі планування → F5 → викидає на root. Втрата контексту.
- ✅ Drill-down state у Zustand persist (sessionStorage):
  ```ts
  nav: { regionCode?, managerLogin?, segmentCode? }
  ```
- ✅ При initial render компонента читати з nav, перемикати у відповідний view.
- ✅ Wrapper-функції `goToManager(login)` оновлюють local state + nav store.
- ✅ Logout очищує nav.

---

## 🔌 Інтеграція з 1С (HTTP-сервіси)

### Перевіряти типи Action-ів у `src/lib/onec-types.ts` ПЕРЕД написанням
- ❌ Раз вгадав поле — `facts[].amount` замість `segments[].factAmountUSD` → весь fact-блок мовчки = 0.
- ✅ ПЕРЕД написанням endpoint що ходить у 1С — відкрити `onec-types.ts` як SOURCE OF TRUTH.
- ✅ Не покладатись на свою пам'ять / на доку 1С — формати міняються.

### Action 5 повертає менеджера у 2 регіонах легітимно
- ✅ Завжди dedup-ити логіни перед викликом 1С: `Array.from(new Set(logins))`.
- ✅ Frontend dedup + backend dedup (як safety net).

### 1С повертає рядкові числа
- ❌ `factAmountUSD: "123.45"` — рядок, не число. `+ 0` не парсить, `parseFloat` потрібен.
- ✅ Helper `toNumber(v)` з `Number.isFinite` перевіркою. Тести на рядкові амаунти.

### Server-to-server виклики наших же API
- ❌ Скрипти що б'ють /api/* падають на 401 без cookie/header.
- ✅ Або `Origin: https://prod-domain.vercel.app` (якщо домен у ALLOWED_ORIGINS).
- ✅ Або `x-api-key: $API_SECRET_KEY` (читати з env).
- ✅ Cookie name: `sp_session`, не `session`. Витягувати regex'ом з `set-cookie`.

---

## 🧪 Тестування

### Pure-функції + node:test + tsx
- ❌ Push без перевірки → user тестує на проді → cycles переробок.
- ✅ Виносити логіку у `src/lib/*.ts` pure-функції (не inline в endpoint/component).
- ✅ Тести у `tests/*.test.ts`, запуск `npm test` через `tsx --test`.
- ✅ tsconfig: `allowImportingTsExtensions: true`.
- ✅ ЗАВЖДИ перед push: `npx tsc --noEmit && npm test && npm run check:arch`.
- ✅ Не казати user «перевір на проді» поки локальні тести не green.

### Інваріанти що варто покривати тестами
- Σ всіх buckets aggregate-функції = totalInput
- Edge cases: пустий вхід, null, undefined, дублі, рядкові числа
- Ключові сценарії UI-логіки (delete + save + refresh) винести у Playwright-script
- Bug який щойно знайшли — додати regression-тест ПЕРЕД фіксом

### Playwright для E2E delete/save flow
- ✅ Скрипт `qa-delete-flows.mjs` — реальний браузер, реальний логін, реальний 1С.
- ✅ Перевірка інваріанту: state ДО refresh = state ПІСЛЯ refresh.
- ✅ Витягувати payload `/api/planning` для діагностики (`page.waitForResponse`).

---

## 🎨 UI / UX

### Назви: «Прогноз (темп)» vs «Запланований»
- ❌ «Прогноз» вживався для двох різних метрик — run-rate (за поточним темпом) і forecast менеджера. Заплутувало.
- ✅ Узгоджена термінологія:
  - `Прогноз (темп)` — run-rate `(факт × всього_дн / пройдено_дн) / план`
  - `Запланований` — план менеджера / план місяця (БЕЗ факту, за вибором user)
  - `Норма` — % робочих днів пройдено
  - `Виконання` — факт / план

### Skeleton + loading states
- ❌ User бачить порожню форму і думає що «нема даних» — насправді 1С ще відповідає.
- ✅ Index «Завантажуємо ваші дані з 1С...» що з'являється при fetch і зникає при response.
- ✅ Не показувати empty state поки `loading === true`.

### Confirm dialog для destructive actions
- ✅ Завжди ConfirmDialog (не browser-`confirm()` бо лагає в Chrome iOS).
- ✅ Bulk-delete bar з двома кнопками: «Скасувати» (нейтральна) + «Видалити обраних» (червона).
- ✅ Текст модалки: «Видалити N клієнтів з [блоку]?» — конкретно, не загально.

### UI rename — змінювати тільки потрібні місця
- ❌ Замінити «Прогноз» → «Прогноз (темп)» скрізь — псує назви блоків (`Прогноз по активних клієнтах`) і колонок (`Прогноз` як `forecastAmount`).
- ✅ Розрізняти семантику кожного входження ПЕРЕД заміною. У сумніві — питати user.

---

## 🚀 Деплой / DevOps

### Vercel + GitHub webhook іноді ламається
- ❌ Push є на GitHub, але Vercel не створює deploy. Дивна тиша.
- ✅ Спершу empty-commit → push (часто триггерить).
- ✅ Якщо ні — нова гілка з тим же commit → push (нова webhook-черга).
- ✅ Якщо ні — Vercel UI → Redeploy without cache.
- ✅ Останній варіант — Settings → Git → Disconnect → Connect.

### Build fails на preview, не на production
- ❌ env vars не shared на preview-environment автоматично.
- ✅ У Vercel → Settings → Environment Variables → шарити змінні на ВСІ environments (Production + Preview + Development).

### Module-level `throw` ламає Vercel build
- ❌ `throw new Error('API_KEY required')` у top-level коду → Vercel не може виконати «Collecting page data» якщо env відсутня.
- ✅ Lazy throws через `function getKey()` — тільки на runtime запиту.

---

## 🛠️ Workflow зі мною (Claude)

### Перед серйозною задачею — погодити план
- 1. **Понятним язиком** для тебе: що зміниться у роботі/системі, що побачиш, ризики.
- 2. **Технічно** для мене: файли/функції/коміти, час, рівень ризику.
- 3. Чекати «добро» перед стартом задач >2 годин.

### Не push-ити фікси наосліп
- ❌ Гадати причину → push → user тестує → не працює → нова гадка → push.
- ✅ ЗАВЖДИ:
  1. Просити payload з DevTools Network ДЛЯ конкретного bug
  2. Виносити логіку у pure-функцію
  3. Писати тест з реальним сценарієм
  4. Запускати `npm test`
  5. ТІЛЬКИ ПОТІМ commit + push

### Якщо однакова проблема втретє — зупинитись
- ❌ Тричі переписував класифікацію buyer-ів — кожен раз цифри різні.
- ✅ Якщо повторюється — НЕ продовжувати. Запитати конкретний приклад («у Вінниці буде X — поверни числа які ти ОЧІКУЄШ»). Або вийти на pure-функцію + тест.

### Memory оновлення для майбутнього
- Кожне нове правило / fix / подія додається у `~/.claude/projects/<slug>/memory/MEMORY.md`.
- Категорії: `feedback` (правила), `project` (стан), `reference` (зовнішні системи).

---

## ⏱️ Конкретні таймінги які варто пам'ятати

| Метрика | Значення |
|---|---|
| Vercel maxDuration default (Hobby) | 10s |
| Vercel maxDuration max (Pro) | 60s |
| Concurrency limit для 1С | 5 паралельних |
| 1С Action timeout | 25s + 1 retry 500ms |
| SWR dedupingInterval (важкі запити) | 120s |
| Vercel ребілд preview | ~60-90s |
| Vercel ребілд production | ~90-120s |

---

**Зведено:** 2026-05-12, після ~3 тижнів роботи над sales-planning.
**Файли-приклади:** `src/lib/region-stats-aggregate.ts`, `src/components/planning/planning-form.tsx`, `tests/`, `scripts/`.
