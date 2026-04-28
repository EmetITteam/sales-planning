# ТЗ для 1С-розробника: HTTP-сервіси для Sales Planning (Спринт 1)

> **Версія:** 2.0 від 08.04.2026
> **Контекст:** Уніфікований HTTP-сервіс для 3 систем (СРМ Мітинг, Планування, Аналітика).
> Спринт 1 — Планування. Розширюємо існуючий сервіс з Мітингу, нічого не ламаємо.

---

## Загальне

Розширити існуючий HTTP-сервіс (той самий що працює в Мітинг 4.0) новими actions.
Існуючі 11 методів СРМ **НЕ ЧІПАТИ** — вони продовжують працювати як є.

**Паттерн запиту/відповіді — як у Мітингу:**
```
POST /api/handler
Content-Type: application/json
Authorization: Basic <base64(login:password)>

Запит:  { "action": "назваДії", "payload": { ... } }
Відповідь: { "status": "success", "data": { ... } }
Помилка:   { "status": "error", "message": "Опис помилки" }
```

**Що потрібно:** розширити `login` + створити 4 нових actions.

---

## Існуючі методи СРМ (НЕ ЗМІНЮВАТИ)

Ці методи вже працюють у Мітинг 4.0, їх не чіпаємо:

| Action | Опис |
|--------|------|
| `getInitialData` | Зустрічі за період + дані для форм |
| `saveNewMeeting` | Створення зустрічі |
| `updateMeeting` | Оновлення зустрічі |
| `startMeeting` | Старт зустрічі |
| `updateMeetingCalendarId` | Прив'язка Google Calendar |
| `saveClientSurvey` | Опитувальник зустрічі |
| `getAllMeetingsForClient` | Історія зустрічей клієнта |
| `getManagerClients` | Список клієнтів менеджера |
| `findClient` | Пошук клієнта |
| `registerNewClient` | Реєстрація клієнта |
| `getClientReport` | Звіт по клієнту |

---

## Action 1: Розширення `login`

**Мета:** Додати до існуючої відповіді роль, регіон і список підлеглих.

**Запит (без змін):**
```json
{
  "action": "login",
  "payload": {
    "login": "siryk@emet.com",
    "password": "..."
  }
}
```

**Відповідь ЗАРАЗ (що вже є):**
```json
{
  "status": "success",
  "data": {
    "login": "siryk@emet.com",
    "role": "Менеджер",
    "auth": true
  }
}
```

**Відповідь ПІСЛЯ розширення (додаємо нові поля, старі залишаються):**
```json
{
  "status": "success",
  "data": {
    "login": "siryk@emet.com",
    "role": "Менеджер",
    "auth": true,
    "roleCode": "manager",
    "fullName": "Сірик Людмила Олексіївна",
    "region": "Дніпро",
    "regionCode": "DNP",
    "managedUsers": []
  }
}
```

**Нові поля:**

| Поле | Тип | Опис |
|------|-----|------|
| `roleCode` | string | `"manager"` / `"rm"` / `"director"` — для веб-додатку |
| `fullName` | string | ПІБ повністю |
| `region` | string | Назва підрозділу користувача (реквізит Підрозділ) |
| `regionCode` | string | Скорочений код регіону (DNP, KYV, ODS, LVV, KHR, ZPR, VNN) |
| `managedUsers` | array | Для менеджера: `[]`. Для РМ: логіни менеджерів його підрозділу. Для директора: логіни всіх РМ |

**Логіка визначення ролі:**
- Є роль "РМ" (Регіональний менеджер) → `roleCode: "rm"`
- Є роль "Директор з продажу" → `roleCode: "director"`
- Інакше → `roleCode: "manager"`

**Логіка `managedUsers`:**
- Менеджер → порожній масив `[]`
- РМ → всі користувачі з тим самим Підрозділом (крім самого РМ)
- Директор → всі користувачі з роллю РМ

**ВАЖЛИВО:** Старе поле `role` (текстове "Менеджер") залишається як є. Додаємо нове поле `roleCode` з кодом. СРМ Мітинг використовує `role`, Планування використовуватиме `roleCode`. Ніщо не ламається.

---

## Action 2: `getClientsForPlanning`

**Мета:** Отримати повний список клієнтів менеджера з категорією та історією закупок по брендах. Викликається 2 рази на місяць для автозавантаження.

**Запит:**
```json
{
  "action": "getClientsForPlanning",
  "payload": {
    "login": "siryk@emet.com"
  }
}
```

**Відповідь:**
```json
{
  "status": "success",
  "data": {
    "clients": [
      {
        "clientId": "00000012345",
        "clientName": "Главацька Дарина Сергіївна",
        "phone": "+380501234567",
        "category": "Активний",
        "purchases": [
          {
            "segmentCode": "PETARAN",
            "segmentName": "Petaran",
            "lastPurchaseDate": "2026-03-15",
            "lastPurchaseAmount": 1250.00
          },
          {
            "segmentCode": "NEURAMIS",
            "segmentName": "Neuramis",
            "lastPurchaseDate": "2026-01-22",
            "lastPurchaseAmount": 890.00
          }
        ]
      },
      {
        "clientId": "00000054321",
        "clientName": "Іванова Олена Петрівна",
        "phone": "+380671234567",
        "category": "Сплячий",
        "purchases": [
          {
            "segmentCode": "NEURONOX",
            "segmentName": "Neuronox",
            "lastPurchaseDate": "2025-11-10",
            "lastPurchaseAmount": 2100.00
          }
        ]
      },
      {
        "clientId": "00000067890",
        "clientName": "Петренко Марія Іванівна",
        "phone": "+380931234567",
        "category": "БезЗакупок",
        "purchases": []
      }
    ]
  }
}
```

**Поля клієнта:**

| Поле | Тип | Опис |
|------|-----|------|
| `clientId` | string | Код контрагента в 1С |
| `clientName` | string | Найменування контрагента |
| `phone` | string | Телефон |
| `category` | string | Категорія з регістру `КатегоріїКлієнтів`: "Активний", "Сплячий", "Втрачений", "Новий", "БезЗакупок" |
| `purchases` | array | Масив закупок по брендах (тільки ті де були продажі) |

**Поля purchases:**

| Поле | Тип | Опис |
|------|-----|------|
| `segmentCode` | string | Код сегменту (НоменклатурнаГрупа) |
| `segmentName` | string | Назва сегменту |
| `lastPurchaseDate` | string | Дата останньої закупки по цьому бренду (YYYY-MM-DD) |
| `lastPurchaseAmount` | number | Сума останнього документу по цьому бренду (USD) |

**Логіка в 1С:**

1. Отримати контрагентів менеджера (як у `getManagerClients`)
2. Для кожного контрагента — категорію з `СрізОстанніх()` регістру `КатегоріїКлієнтів`
3. Для кожного контрагента — по кожному бренду: MAX(Дата) та Сума з останнього документу реалізації. Бренд = НоменклатурнаГрупа товару
4. Якщо клієнт не купував жодного бренду — `purchases: []` (але клієнта все одно включати)
5. Бренди без закупок для цього клієнта — НЕ включати в `purchases[]`

**8 сегментів (брендів):**
- Petaran, Ellanse, EXOXE, ESSE, Neuramis, Neuronox, Vitaran, Інші ТМ

**Важливо:**
- Суми в доларах (USD) — вони вже є в регістрі
- `lastPurchaseAmount` — сума саме останнього документу, а не загальна сума
- Максимальна кількість клієнтів у менеджера — ~400
- Метод викликається рідко (2 рази на місяць), швидкодія не критична

---

## Action 3: `getSalesFact`

**Мета:** Отримати факт продажів за місяць — загальний підсумок по сегменту + деталізацію по конкретних клієнтах зі списку планування.

**Запит:**
```json
{
  "action": "getSalesFact",
  "payload": {
    "login": "siryk@emet.com",
    "period": "2026-04",
    "clientIds": ["00000012345", "00000054321", "00000067890"]
  }
}
```

| Параметр | Тип | Опис |
|----------|-----|------|
| `login` | string | Email менеджера |
| `period` | string | Місяць у форматі YYYY-MM |
| `clientIds` | array | Масив кодів контрагентів зі списку планування (до 400 штук) |

**Відповідь:**
```json
{
  "status": "success",
  "data": {
    "segments": [
      {
        "segmentCode": "PETARAN",
        "segmentName": "Petaran",
        "totalFactUSD": 18500.00,
        "clients": [
          {
            "clientId": "00000012345",
            "clientName": "Главацька Д.С.",
            "factAmountUSD": 1250.00
          },
          {
            "clientId": "00000054321",
            "clientName": "Іванова О.П.",
            "factAmountUSD": 1950.00
          }
        ]
      },
      {
        "segmentCode": "NEURAMIS",
        "segmentName": "Neuramis",
        "totalFactUSD": 7200.00,
        "clients": [
          {
            "clientId": "00000012345",
            "clientName": "Главацька Д.С.",
            "factAmountUSD": 890.00
          }
        ]
      }
    ]
  }
}
```

**Поля segments:**

| Поле | Тип | Опис |
|------|-----|------|
| `segmentCode` | string | Код сегменту |
| `segmentName` | string | Назва сегменту |
| `totalFactUSD` | number | Загальний факт по сегменту за місяць — ВСІ клієнти менеджера, не тільки ті що в clientIds |
| `clients` | array | Деталізація тільки по клієнтах з clientIds |

**Поля clients:**

| Поле | Тип | Опис |
|------|-----|------|
| `clientId` | string | Код контрагента |
| `clientName` | string | Назва контрагента (скорочена) |
| `factAmountUSD` | number | Сума продажів цього клієнта по цьому сегменту за місяць (USD) |

**Логіка в 1С:**

1. Обороти регістру `Продажі` WHERE Менеджер = login AND Період з 1-го числа місяця по останній день
2. `totalFactUSD` = SUM(СуммаUSD) GROUP BY НоменклатурнаГрупа — по ВСІХ клієнтах менеджера
3. `clients[]` = SUM(СуммаUSD) GROUP BY НоменклатурнаГрупа, Контрагент WHERE Контрагент В (&clientIds)
4. Якщо клієнт з clientIds не купував цей бренд у цьому місяці — НЕ включати його в clients[]
5. Сегменти де totalFactUSD = 0 і clients порожній — НЕ включати в відповідь

**Важливо:**
- `totalFactUSD` вважається по ВСІХ клієнтах менеджера (може бути 1000+), а `clients[]` фільтрується тільки по переданому масиву `clientIds`
- Це різні числа: totalFactUSD ≥ SUM(clients[].factAmountUSD)
- Суми в доларах — вони є в регістрі
- Якщо кілька документів по одному клієнту/бренду — сумувати в один рядок

---

## Action 4: `getRegistryPlans`

**Мета:** Отримати плани продажів за період з деталізацією по підрозділах, менеджерах і сегментах.

**Запит:**
```json
{
  "action": "getRegistryPlans",
  "payload": {
    "dateFrom": "2026-04-01",
    "dateTo": "2026-04-30"
  }
}
```

| Параметр | Тип | Опис |
|----------|-----|------|
| `dateFrom` | string | Початок періоду (YYYY-MM-DD) |
| `dateTo` | string | Кінець періоду (YYYY-MM-DD) |

**Відповідь:**
```json
{
  "status": "success",
  "data": {
    "plans": [
      {
        "period": "2026-04-01",
        "divisionCode": "DNP",
        "divisionName": "Дніпро",
        "managerCode": "00000000015",
        "managerName": "Сірик Людмила",
        "segmentCode": "PETARAN",
        "segmentName": "Petaran",
        "planAmountUSD": 7490.00
      },
      {
        "period": "2026-04-01",
        "divisionCode": "DNP",
        "divisionName": "Дніпро",
        "managerCode": "00000000015",
        "managerName": "Сірик Людмила",
        "segmentCode": "NEURAMIS",
        "segmentName": "Neuramis",
        "planAmountUSD": 5000.00
      },
      {
        "period": "2026-04-01",
        "divisionCode": "KYV",
        "divisionName": "Київ",
        "managerCode": "00000000020",
        "managerName": "Петренко Валентина",
        "segmentCode": "PETARAN",
        "segmentName": "Petaran",
        "planAmountUSD": 6000.00
      }
    ]
  }
}
```

**Поля plans:**

| Поле | Тип | Опис |
|------|-----|------|
| `period` | string | Дата періоду плану (YYYY-MM-DD) |
| `divisionCode` | string | Код підрозділу |
| `divisionName` | string | Назва підрозділу |
| `managerCode` | string | Код менеджера (користувача) |
| `managerName` | string | ПІБ менеджера |
| `segmentCode` | string | Код сегменту (НоменклатурнаГрупа) |
| `segmentName` | string | Назва сегменту |
| `planAmountUSD` | number | Сума плану в USD |

**Логіка в 1С:**

1. Регістр `ПлануванняПродажів` (або документ "Планування продажів") за період dateFrom–dateTo
2. Повертати ВСІ рядки: по всіх підрозділах, менеджерах, сегментах
3. Не фільтрувати по конкретному менеджеру — веб-додаток сам фільтрує на своїй стороні

**Важливо:**
- Метод повертає ВСІ плани за період (не фільтрований по одному менеджеру)
- Плани заводяться раз на місяць — даних небагато (~25 менеджерів × 8 сегментів = ~200 рядків)
- Цей метод використовуватиметься і в Плануванні, і в СРМ дашборді, і пізніше в Аналітиці

---

## Action 5: `getRegionData`

**Мета:** Агреговані дані план/факт по всіх менеджерах регіону. Для РМ та Директора.

**Запит:**
```json
{
  "action": "getRegionData",
  "payload": {
    "login": "rm.dnipro@emet.com",
    "period": "2026-04"
  }
}
```

| Параметр | Тип | Опис |
|----------|-----|------|
| `login` | string | Email РМ або Директора |
| `period` | string | Місяць (YYYY-MM) |

**Відповідь:**
```json
{
  "status": "success",
  "data": {
    "region": "Дніпро",
    "managers": [
      {
        "managerName": "Сірик Людмила",
        "managerLogin": "siryk@emet.com",
        "segments": [
          {
            "segmentCode": "PETARAN",
            "segmentName": "Petaran",
            "planAmountUSD": 7490,
            "factAmountUSD": 3200
          },
          {
            "segmentCode": "NEURAMIS",
            "segmentName": "Neuramis",
            "planAmountUSD": 5000,
            "factAmountUSD": 2100
          }
        ],
        "totalPlan": 12490,
        "totalFact": 5300
      },
      {
        "managerName": "Петренко Валентина",
        "managerLogin": "petrenko@emet.com",
        "segments": [
          {
            "segmentCode": "PETARAN",
            "segmentName": "Petaran",
            "planAmountUSD": 6000,
            "factAmountUSD": 4500
          },
          {
            "segmentCode": "NEURONOX",
            "segmentName": "Neuronox",
            "planAmountUSD": 3000,
            "factAmountUSD": 1200
          }
        ],
        "totalPlan": 9000,
        "totalFact": 5700
      }
    ]
  }
}
```

**Поля managers:**

| Поле | Тип | Опис |
|------|-----|------|
| `managerName` | string | ПІБ менеджера |
| `managerLogin` | string | Email менеджера |
| `segments` | array | План/факт по кожному сегменту |
| `totalPlan` | number | Сума плану по всіх сегментах (USD) |
| `totalFact` | number | Сума факту по всіх сегментах (USD) |

**Поля segments:**

| Поле | Тип | Опис |
|------|-----|------|
| `segmentCode` | string | Код сегменту |
| `segmentName` | string | Назва сегменту |
| `planAmountUSD` | number | План (USD) |
| `factAmountUSD` | number | Факт продажів за місяць (USD) |

**Логіка в 1С:**

1. За логіном визначити роль і підрозділ (з того ж механізму що в `login`)
2. **РМ** → отримати всіх менеджерів свого підрозділу
3. **Директор** → отримати всіх менеджерів всіх підрозділів
4. По кожному менеджеру:
   - План: з регістру `ПлануванняПродажів` за місяць, GROUP BY сегмент
   - Факт: з оборотів `Продажі` за місяць, GROUP BY сегмент
5. `totalPlan` / `totalFact` = сума по всіх сегментах менеджера

**Важливо:**
- Факт — з 1-го числа місяця по поточну дату
- Сегменти де і план = 0 і факт = 0 — не включати
- Якщо менеджер не має плану — не включати його

---

## Зведена таблиця

| # | Action | Тип | Пріоритет | Оцінка (год) |
|---|--------|-----|-----------|-------------|
| 1 | `login` розширення | Змінити існуючий | 🔴 Високий | 4–6 |
| 2 | `getClientsForPlanning` | Новий | 🔴 Високий | 8–10 |
| 3 | `getSalesFact` | Новий | 🔴 Високий | 6–8 |
| 4 | `getRegistryPlans` | Новий | 🔴 Високий | 4–6 |
| 5 | `getRegionData` | Новий | 🟡 Середній | 6–8 |
| | **Разом** | | | **28–38** |

---

## Порядок реалізації

**Крок 1 (перші 2–3 дні):**
- `login` розширення — база для всього (роль, регіон)
- `getRegistryPlans` — простий, читання регістру

**Крок 2 (дні 3–5):**
- `getSalesFact` — агрегатний запрос, залежить від розуміння регістру Продажі
- `getClientsForPlanning` — найскладніший, категорія + продажі по брендах

**Крок 3 (дні 5–7):**
- `getRegionData` — використовує логіку з login + getSalesFact + getRegistryPlans

---

## Тестування

Після реалізації кожного action — протестувати в Postman:

```
POST https://[1с-сервер]/api/handler
Authorization: Basic [login:password в base64]
Content-Type: application/json

{ "action": "getClientsForPlanning", "payload": { "login": "feshchenko@emet.com" } }
```

**Очікуваний результат:** `{ "status": "success", "data": { ... } }`
**При помилці:** `{ "status": "error", "message": "Текст помилки" }`

### Чек-ліст тестів:

**login:**
- [ ] Менеджер: roleCode = "manager", managedUsers = []
- [ ] РМ: roleCode = "rm", managedUsers = [список логінів]
- [ ] Директор: roleCode = "director", managedUsers = [список РМ]
- [ ] Старі поля (login, role, auth) все ще присутні

**getClientsForPlanning:**
- [ ] Повертає всіх клієнтів менеджера
- [ ] У кожного є category
- [ ] purchases[] містить тільки бренди де були закупки
- [ ] lastPurchaseAmount — сума останнього документу, не загальна
- [ ] Клієнт без закупок — purchases: []

**getSalesFact:**
- [ ] totalFactUSD рахує ВСІ продажі менеджера (не тільки clientIds)
- [ ] clients[] містить тільки контрагентів з переданого clientIds
- [ ] Кілька документів по одному клієнту/бренду — сумовані
- [ ] Пустий clientIds → тільки totalFactUSD, без clients

**getRegistryPlans:**
- [ ] Повертає плани по ВСІХ менеджерах/підрозділах
- [ ] Деталізація по сегментах

**getRegionData:**
- [ ] РМ бачить тільки свій підрозділ
- [ ] Директор бачить всі підрозділи
- [ ] totalPlan і totalFact вірно підсумовані

---

## Майбутні спринти (для інформації, зараз НЕ робити)

**Спринт 2 — Перехід на нову СРМ Мітинг:**
- Можливо додаткові методи для дашборду (використовуватимуть getSalesFact і getRegionData)

**Спринт 3 — Аналітика:**
- Тяжкі методи ETL: getRegistrySales (50K+ рядків), getRegistrySalesCost, getRegistryBudgetPL, getRegistryBudgetCash
- getDictionary (довідники)
- getClientCategories (регістр категорій)
- Сервісний акаунт для ETL
- Можливо розділення на 2 ендпоінти (query/etl)

**Додаткові методи (пізніше):**
- `checkActivities` — перевірка дзвінків/зустрічей по клієнтах

---

## Контакти

| | |
|---|---|
| Веб-додаток | https://sales-planning-lyart.vercel.app |
| Репозиторій | https://github.com/EmetITteam/sales-planning |
| Архітектура | `ARCHITECTURE.md` в корені репозиторію |
