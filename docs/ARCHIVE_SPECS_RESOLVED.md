# Архів виконаних специфікацій 1С

Об'єднаний архів закритих специфікацій для 1С-розробника. Кожна секція = окрема дія/розширення з датою резолюції зверху.

Дивись також:
- [SPEC_PENDING_1C_ITEMS.md](./SPEC_PENDING_1C_ITEMS.md) — pending специфікації що ще не зроблено
- [ARCHIVE_PLANS.md](./ARCHIVE_PLANS.md) — архів виконаних планів

---

# 1. Action 5 — параметр `includeAll`

> **Resolved 2026-05-25.** Андрій (1С-розробник) задеплоїв `includeAll: true` у Action 5. Зараз отримуємо 19 регіонів замість 11. Усі 4 проблемні підрозділи (Колл-центр / Адасса / Полтава / Чернівці) повертають реальний факт. Backward-compatible: існуючі дашборди (РМ, Director) не передають прапор → нічого не змінилось для них.

**Для:** Андрія (1С розробник)
**Версія:** v2.7
**Дата спеки:** 2026-05-25

## Контекст

Зробили адмін-вкладку «Огляд компанії» на веб-дашборді. Там показуємо план/факт по **всіх** підрозділах включно з:
- Колл-центр
- Адасса
- Полтава* (Чугуй)
- Чернівці* (Хайленко)

Раніше `Action 5 getRegionData` повертав тільки 9 з 13 підрозділів — фільтрував по менеджерах.

## Що зроблено

Додано у `Action 5 getRegionData` опціональний параметр `includeAll: boolean` у `payload`.

### Поведінка

| `includeAll` | Поведінка |
|---|---|
| `false` (default, відсутнє) | **Як раніше** — фільтр по менеджерах, повертає тільки релевантні підрозділи |
| `true` | **Нова** — повертає ВСІ підрозділи компанії з фактом, ігноруючи фільтр |

### Сумісність

Існуючі дашборди (РМ, Director) не передають `includeAll` → нічого не змінилось для них.

## Приклад request

```json
{
  "action": "getRegionData",
  "payload": {
    "login": "sdu@emet.in.ua",
    "period": "2026-05",
    "includeAll": true
  }
}
```

## Приклад response (з `includeAll: true`)

Та сама структура що раніше, просто більше елементів у `regions[]`:

```json
{
  "status": "success",
  "data": {
    "asOfDate": "2026-05-25",
    "prevMonthAsOfDate": "2026-04-30",
    "regions": [
      {
        "regionName": "Київ",
        "regionCode": "KYV",
        "managers": [ /* як раніше */ ]
      },
      /* ... інші 8 представництв (як раніше) ... */

      /* Нові 4 підрозділи: */
      {
        "regionName": "Коллцентр Call center лидогенерация",
        "regionCode": "000000060",
        "managers": [ /* реальні менеджери Колл-центру з фактом */ ]
      },
      {
        "regionName": "Адасса",
        "regionCode": "000000120",
        "managers": [ /* реальні менеджери Адасси з фактом */ ]
      },
      {
        "regionName": "Полтава*",
        "regionCode": "000000042",
        "managers": [
          {
            "managerName": "Чугуй",
            "managerLogin": "...",
            "segments": [ /* план/факт по 9 сегментах */ ],
            "totalPlan": 133646,
            "totalFact": "...",
            "totalPrevMonthFact": "..."
          }
        ]
      },
      {
        "regionName": "Черновцы*",
        "regionCode": "000000047",
        "managers": [ /* Хайленко */ ]
      }
    ]
  }
}
```

## Edge cases

1. **Підрозділ без жодного менеджера у системі** — або синтетичний менеджер, або порожній `managers: []`.
2. **prevMonthFact для нових підрозділів** — якщо є → повертати, якщо нема → `0`.
3. **Безпека** — у Next.js backend є гард: тільки `role === 'admin'` може передавати `includeAll: true`. 1С не виконує перевірок.

## Як перевірити з нашого боку

```bash
node scripts/diag-divisions.mjs
```

У секції `Action 5: getRegionData` має бути 13 регіонів. На 2026-05-25 — підтверджено.

---

# 2. Action 5 — `includeAll` (рання заглушка)

> **Resolved 2026-05-25.** Зміна не потрібна — це була помилка в нашому розумінні. Реально 1С на тоді просто пропускав менеджерів деяких підрозділів (Колл-центр, Адасса, Чугуй=Полтава, Хайленко=Чернівці). Користувач коректував це на стороні 1С. Без зміни API нашого боку. Через тиждень Андрій додав окремий `includeAll` (секція 1 цього файлу) для аналогічного use-case на адмін-дашборді.

## Контекст

Спочатку думали що треба розширювати API через `includeAll` прапор. Виправлено:

**Реально:** менеджери присутні у 1С. Просто Action 5 на той момент передавав не всіх — внутрішня логіка трансмісії пропускала менеджерів деяких підрозділів.

## Що зробили

Нічого з нашого боку. Поточний код працював коректно як тільки 1С почав передавати повний список менеджерів. Адаптер у `src/lib/onec-adapters.ts` нічого не міняли.

## Як перевірити коли все буде готово

```bash
node scripts/diag-divisions.mjs
```

У секції `Action 5: getRegionData` має з'явитись 13 регіонів.

---

# 3. Action A — `getClientFocus`

> **Resolved 2026-05-28.** 1С-розробник реалізував bulk-дію `getClientFocus` для регістру відомостей «фокус клієнта». Frontend hook `useClientFocuses` (chunk 200, до 600 ID) уже працює у проді на сторінці `/clients`. Whitelist додано у `/api/onec/route.ts` (LOGIN_BOUND_ACTIONS). Типи у `src/lib/onec-types.ts` (`GetClientFocusRequest`, `GetClientFocusResponse`, `ClientFocusItem`).

**Призначення:** Повернути **список активних фокусів** для масиву клієнтів. Фокус — запис з регістра відомостей у 1С. На одного клієнта може бути **кілька активних фокусів одночасно**.

## Запит

```json
{
  "action": "getClientFocus",
  "payload": {
    "login": "manager.dnepr@emet.in.ua",
    "clientIds": ["C001", "C002", "C003"]
  }
}
```

| Параметр | Тип | Обов'язковий | Опис |
|---|---|:---:|---|
| `login` | string | Так | Логін менеджера. Фокус прив'язаний до менеджера — повертати лише ті, що виставлені для цього менеджера. |
| `clientIds` | string[] | Так | Масив `Код` контрагентів. Від 1 до ~500 елементів. |

## Відповідь

```json
{
  "status": "success",
  "data": {
    "focuses": [
      {
        "clientId": "C001",
        "items": [
          { "focusName": "У фокусі: Neuronox",   "since": "2026-04-15", "validUntil": "2026-07-15" },
          { "focusName": "Реактивація",          "since": "2026-05-01", "validUntil": null }
        ]
      },
      {
        "clientId": "C002",
        "items": [
          { "focusName": "Новий — онбординг", "since": "2026-05-20", "validUntil": "2026-08-20" }
        ]
      },
      {
        "clientId": "C003",
        "items": []
      }
    ]
  }
}
```

### Поля `focuses[]`

| Поле | Тип | Обов'язкове | Опис |
|---|---|:---:|---|
| `clientId` | string | Так | Код контрагента (як у запиті). |
| `items` | Focus[] | Так | Масив активних фокусів. Порожній `[]` якщо клієнт ні у одному фокусі. |

### Поля `Focus`

| Поле | Тип | Обов'язкове | Опис |
|---|---|:---:|---|
| `focusName` | string | Так | Текст з регістра 1С як є. |
| `since` | string | Так | Дата встановлення фокусу, `YYYY-MM-DD`. |
| `validUntil` | string \| null | Так | Дата закінчення фокусу `YYYY-MM-DD`. `null` — безстроковий. |

## Логіка в 1С

1. Звернутись до регістра відомостей.
2. Фільтри:
   - `Контрагент IN clientIds`
   - `Менеджер == login`
   - Тільки **активні на сьогодні**: `Дата ≤ TODAY AND (ДатаЗакінчення IS NULL OR ДатаЗакінчення ≥ TODAY)`
3. Сгрупувати по `Контрагент` → отримати масив `items[]`.
4. Для **кожного** `clientId` зі вхідного списку — повертати рядок (з пустим `items` якщо фокусів нема).

## Edge cases

- `clientIds` порожній → `focuses: []` (НЕ помилка).
- Клієнт прив'язаний до іншого менеджера → повертати з пустим `items` (privacy).
- Якщо фокус у регістрі є але вже скінчився (`validUntil < TODAY`) — НЕ повертати.

## Performance

- Цільова швидкодія: < 300мс на запит для ~500 clientIds.
- Очікувана частота: 1 раз на сесію (відкриття `/clients`) + кеш у SWR на 60-300с.

## Sales Planning — як використовується

```ts
// src/lib/use-my-clients.ts
const focusPayload = login && clientIds.length > 0
  ? { login, clientIds }
  : null;
const { data: focusRes } = useOneCData('getClientFocus', focusPayload);

const focusByClient = useMemo(() => {
  const out: Record<string, Focus[]> = {};
  for (const f of focusRes?.focuses ?? []) {
    out[f.clientId] = f.items;
  }
  return out;
}, [focusRes]);
```

UI: у рядку клієнта поряд з category-chip — невеликі chip-и з кожним активним фокусом.

---

# 4. Action C — `getManagerClients` extension з `isReserved`

> **Resolved 2026-05-28.** 1С-розробник додав `isReserved: boolean` поле у `getManagerClients`. Sales Planning одразу почав показувати Резерв-tag і Резерв-секцію у списку клієнтів. Помилка sync з `properties[]` (Bug 1) виправлена в той самий день.

**Призначення:** Існуюча дія `getManagerClients` повертала базову інформацію по клієнтах менеджера. Додано **`isReserved: boolean`** — позначка чи клієнт у «Резерві» (на нього менеджер не звертає уваги).

**Чому НЕ через properties:** `properties` доступне тільки через `getClientReport` (per-client lazy). Sales Planning потребує знати «резервність» клієнта **upfront для всього списку 481 клієнтів** — для фільтра-pills і окремого розділу у списку.

## Зміна формату відповіді `getManagerClients`

**Було**:
```json
{
  "clients": [{
    "ClientID": "...",
    "ClientName": "...",
    "ClientCategory": "...",
    "ClientAddress": "...",
    "Phone": "..."
  }]
}
```

**Стало** (додано одне нове поле):
```json
{
  "clients": [{
    "ClientID": "...",
    "ClientName": "...",
    "ClientCategory": "...",
    "ClientAddress": "...",
    "Phone": "...",
    "isReserved": false
  }]
}
```

> **Примітка:** `managerName` / `isMine` у `getManagerClients` нема (вони лише у `findClient` бо там результат включає чужих менеджерів). У `getManagerClients` усі клієнти — свої.

## Логіка `isReserved`

- `true` — клієнт має у `properties` категорію/прапор «Резерв»
- `false` — у решті випадків

## Що використовується у Sales Planning

- Окрема hero-картка з лічильником резерв-клієнтів
- Окрема секція у списку (за замовч згорнута)
- Tag `[Резерв]` поряд з category-chip у рядку клієнта
- Включаються у загальний counter «База клієнтів»

## Інші точки інтеграції

- `findClient` — додано те саме поле у його response (для глобального пошуку)
- `getClientReport` — `properties[]` лишилося як є (для повного детального view)

---

# 5. Bug 1 — `isReserved` не синхронізовано з `properties[]`

> **Resolved 2026-05-28.** 1С-розробник зробив правильний sync. Frontend одразу почав показувати Резерв-tag без жодних змін у нашому коді (defensive `isClientReserved` helper у `src/lib/mityng-types.ts` зловив поле).

**Що було:** Для клієнта Смаглова Катерина (`380502837016`):
- `getClientReport.clientInfo.properties` = `["Резерв", "Валидный viber номер", "Зарегестрирован в LMS"]`
- `getManagerClients.isReserved` = `false` (помилково)

**Resolved:** 2026-05-28 1С-розробник зробив правильний sync. Тепер для Смаглової `isReserved: true` приходить як очікувано.

---

# 6. Action 5 Extension — раніше думали потрібен (видалена спека)

> **Resolved 2026-05-25.** 26-рядковий stub `SPEC_ACTION5_EXTENSION.md` що казав «нічого розширювати не треба». Видалено як архівне сміття. Сама ідея виявилась помилковою — реально проблема була у 1С з фільтрацією менеджерів деяких підрозділів, без зміни API. Згодом замінена на повноцінну спеку `includeAll` (секція 1 цього файлу).

---

# 7. Bug 2: `checkActivities.hasCall` завжди false

> **Resolved 2026-05-27.** Виявлено на клієнті Балабан (`000014595`) — `checkActivities` повертав `hasCall: false` хоча у `getClientReport.lastCalls` були дзвінки. 1С-розробник виправив джерело — тепер дзвінки приходять через `checkActivities` коректно. Hero Card 4 на `/clients` використовує `checkActivities` напряму.

---

# 8. clientStats discrepancy: Σ category ≠ totalClients

> **Resolved 2026-05-27.** Розбіжність у Action 5 clientStats: сума категорій (12769) ≠ totalClients (9111) у Представництвах. 1С-розробник виправив — дані тепер сходяться. Колишній файл `SPEC_CLIENTSTATS_DISCREPANCY.md` видалено.

---

_Архів зведено 2026-05-27, оновлено 2026-05-28._
