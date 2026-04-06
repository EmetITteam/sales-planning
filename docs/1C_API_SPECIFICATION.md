# ТЗ для 1С-розробника: HTTP-сервіси для Sales Planning

## Загальне

Потрібно розширити існуючий HTTP-сервіс (той самий що використовується в Мітинг 4.0) новими actions.

**Паттерн запиту/відповіді — як у Мітингу:**
```
POST /api/handler
Content-Type: application/json

Запит:  { "action": "назваДії", "payload": { ... } }
Відповідь: { "status": "success" | "error", "data": { ... }, "message": "..." }
```

**Базова авторизація:** ONEC_LOGIN / ONEC_PASSWORD (Basic Auth), як у Мітингу.

Потрібно створити **5 нових actions** + розширити існуючий `login`.

---

## Action 1: `getSalesPlan`

**Мета:** Отримати місячний план продажів для менеджера по всіх сегментах (ТМ).

**Запит:**
```json
{
  "action": "getSalesPlan",
  "payload": {
    "login": "feshchenko@emet.com",
    "period": "2026-04"
  }
}
```
- `login` — email менеджера (той самий що в Мітингу)
- `period` — місяць у форматі YYYY-MM

**Звідки брати:**
- Документ "Планування продажів" за цей місяць
- Фільтр: по менеджеру (підрозділ/відповідальний)
- Розбивка: по сегментах номенклатури

**Відповідь:**
```json
{
  "status": "success",
  "data": {
    "plans": [
      {
        "segmentCode": "ESSE",
        "segmentName": "ESSE",
        "planAmount": 14389.00
      },
      {
        "segmentCode": "PETARAN",
        "segmentName": "Petaran",
        "planAmount": 7490.00
      }
    ],
    "exchangeRate": 41.35,
    "periodStart": "2026-04-01",
    "periodEnd": "2026-04-30"
  }
}
```

**Важливо:**
- `planAmount` — в доларах (конвертувати по курсу з 1С якщо план в грн)
- `exchangeRate` — поточний курс долара
- `segmentCode` — код сегменту номенклатури (унікальний ідентифікатор)
- Повертати ВСІ сегменти де є план для цього менеджера

---

## Action 2: `getSalesFact`

**Мета:** Отримати нарастаючий факт продажів з початку місяця по менеджеру, з розбивкою по клієнтах і сегментах.

**Запит:**
```json
{
  "action": "getSalesFact",
  "payload": {
    "login": "feshchenko@emet.com",
    "period": "2026-04",
    "dateTo": "2026-04-12"
  }
}
```
- `period` — місяць
- `dateTo` — до якої дати рахувати факт (наростаючий з 1-го числа місяця до цієї дати)

**Звідки брати:**
- Документи реалізації (проведені) за період 01.04 – dateTo
- Фільтр: менеджер (відповідальний), статус = проведено
- Групування: по сегментах, всередині — по контрагентах

**Відповідь:**
```json
{
  "status": "success",
  "data": {
    "facts": [
      {
        "segmentCode": "PETARAN",
        "segmentName": "Petaran",
        "totalAmount": 756.00,
        "clients": [
          {
            "clientId": "000001234",
            "clientName": "Бліндовська Яна Олександрівна",
            "amount": 378.00,
            "lastSaleDate": "2026-04-03"
          },
          {
            "clientId": "000005678",
            "clientName": "Карапиш Лариса Володимирівна",
            "amount": 378.00,
            "lastSaleDate": "2026-04-04"
          }
        ]
      }
    ]
  }
}
```

**Важливо:**
- `clientId` — код контрагента в 1С (унікальний)
- `amount` — сума в доларах (конвертувати по курсу)
- `totalAmount` — сума по всіх клієнтах в сегменті
- Якщо клієнт купив двічі за період — сумувати в один рядок
- `lastSaleDate` — дата останньої реалізації цього клієнта

---

## Action 3: `getActiveClients`

**Мета:** Отримати список активних клієнтів по сегменту — тих хто купував цей сегмент за останні 3 місяці.

**Запит:**
```json
{
  "action": "getActiveClients",
  "payload": {
    "login": "feshchenko@emet.com",
    "segmentCode": "PETARAN"
  }
}
```

**Звідки брати:**
- Документи реалізації за останні 3 місяці (від поточної дати)
- Фільтр: менеджер + сегмент номенклатури
- Контрагенти які мають хоча б одну проведену реалізацію в цьому сегменті

**Відповідь:**
```json
{
  "status": "success",
  "data": {
    "clients": [
      {
        "clientId": "000001234",
        "clientName": "Бліндовська Яна Олександрівна",
        "lastPurchaseDate": "2026-03-05",
        "lastPurchaseAmount": 378.00,
        "phone": "+380501234567",
        "address": "м. Дніпро"
      },
      {
        "clientId": "000005678",
        "clientName": "Андрущук Катерина Миколаївна",
        "lastPurchaseDate": "2026-02-10",
        "lastPurchaseAmount": 378.00,
        "phone": "+380509876543",
        "address": "м. Дніпро"
      }
    ]
  }
}
```

**Важливо:**
- `lastPurchaseDate` і `lastPurchaseAmount` — по КОНКРЕТНОМУ СЕГМЕНТУ, не по всіх товарах
- Сума в доларах
- Повертати ТІЛЬКИ клієнтів цього менеджера
- Сортування: за датою останньої покупки (нові зверху)

---

## Action 4: `getInactiveClients`

**Мета:** Отримати список неактивних клієнтів по сегменту — для закриття розриву.

**Запит:**
```json
{
  "action": "getInactiveClients",
  "payload": {
    "login": "feshchenko@emet.com",
    "segmentCode": "PETARAN"
  }
}
```

**Звідки брати:**
- Контрагенти які купували цей сегмент БУДЬ-КОЛИ, але НЕ за останні 3 місяці
- Категорія з регістру "Категорії клієнтів" (поточний місяць)
- Фільтр: тільки клієнти цього менеджера

**Відповідь:**
```json
{
  "status": "success",
  "data": {
    "clients": [
      {
        "clientId": "000009999",
        "clientName": "Астровська Катерина Юріївна",
        "category": "Сплячий",
        "lastPurchaseDate": "2025-11-10",
        "lastPurchaseAmount": 378.00,
        "phone": "+380631234568",
        "address": "м. Дніпро"
      },
      {
        "clientId": "000008888",
        "clientName": "Булдакова Регіна",
        "category": "Втрачений",
        "lastPurchaseDate": "2025-06-15",
        "lastPurchaseAmount": 252.00,
        "phone": "+380661234568",
        "address": "м. Шахтарськ"
      }
    ]
  }
}
```

**Важливо:**
- `category` — текстове значення з регістру категорій: "Сплячий", "Втрачений", "БЗ" і т.д.
- `lastPurchaseDate` і `lastPurchaseAmount` — по КОНКРЕТНОМУ СЕГМЕНТУ
- Тільки клієнти цього менеджера

---

## Action 5: `checkActivities`

**Мета:** Перевірити чи були дзвінки/зустрічі з клієнтами за період.

**Запит:**
```json
{
  "action": "checkActivities",
  "payload": {
    "login": "feshchenko@emet.com",
    "period": "2026-04",
    "dateTo": "2026-04-12",
    "clients": [
      { "clientId": "000001234", "activityType": "call" },
      { "clientId": "000005678", "activityType": "meeting" },
      { "clientId": "000009999", "activityType": "call" }
    ]
  }
}
```
- `activityType` — `"call"` (дзвінок) або `"meeting"` (зустріч)
- `clients` — масив клієнтів для перевірки

**Звідки брати:**
- Дзвінки: документ "Подія" (тип = телефонний дзвінок) або дані з API Київстар
- Зустрічі: Менеджер контактів / Мітинг (документ зустрічі)
- Період: від 1-го числа місяця до `dateTo`

**Відповідь:**
```json
{
  "status": "success",
  "data": {
    "activities": [
      {
        "clientId": "000001234",
        "activityType": "call",
        "done": true,
        "lastDate": "2026-04-05",
        "count": 3
      },
      {
        "clientId": "000005678",
        "activityType": "meeting",
        "done": false,
        "lastDate": null,
        "count": 0
      },
      {
        "clientId": "000009999",
        "activityType": "call",
        "done": true,
        "lastDate": "2026-04-10",
        "count": 1
      }
    ]
  }
}
```

**Важливо:**
- `done` — true якщо хоча б один дзвінок/зустріч за період
- `lastDate` — дата останнього дзвінка/зустрічі
- `count` — кількість за період

---

## Розширення існуючого `login`

**Мета:** Додати роль, регіон і список підлеглих до відповіді логіну.

**Що додати до поточної відповіді:**
```json
{
  "role": "manager",
  "region": "Дніпро",
  "regionCode": "DNP",
  "managedUsers": []
}
```

**Логіка:**
- `role`: `"manager"` | `"rm"` | `"director"` — визначається за роллю користувача в 1С
- `region`: назва представництва/підрозділу
- `regionCode`: скорочений код (для URL)
- `managedUsers`: для РМ — масив логінів менеджерів його регіону; для Директора — масив логінів всіх РМ

---

## Action 6: `getRegionData` (для РМ і Директора)

**Мета:** Агреговані дані план/факт по всіх менеджерах регіону.

**Запит:**
```json
{
  "action": "getRegionData",
  "payload": {
    "login": "rm.dnipro@emet.com",
    "period": "2026-04",
    "dateTo": "2026-04-12"
  }
}
```

**Звідки брати:**
- Визначити всіх менеджерів регіону (по підрозділу РМ)
- По кожному менеджеру: план і факт по всіх сегментах
- Для Директора: по всіх регіонах

**Відповідь:**
```json
{
  "status": "success",
  "data": {
    "regionName": "Дніпро",
    "regionCode": "DNP",
    "managers": [
      {
        "login": "feshchenko@emet.com",
        "name": "Фещенко Олена",
        "segments": [
          {
            "segmentCode": "PETARAN",
            "segmentName": "Petaran",
            "planAmount": 3745,
            "factAmount": 756,
            "factPercent": 20.2
          }
        ]
      }
    ]
  }
}
```

---

## Пріоритет реалізації

| # | Action | Пріоритет | Складність | Примітка |
|---|--------|-----------|------------|----------|
| 1 | `getSalesPlan` | 🔴 Високий | Низька | Один документ, просте читання |
| 2 | `getSalesFact` | 🔴 Високий | Середня | Агрегація реалізацій по клієнтах |
| 3 | `getActiveClients` | 🔴 Високий | Середня | Фільтр за 3 місяці по сегменту |
| 4 | Розширення `login` | 🔴 Високий | Низька | Додати 4 поля до існуючого |
| 5 | `getInactiveClients` | 🟡 Середній | Середня | Регістр категорій + історія покупок |
| 6 | `checkActivities` | 🟡 Середній | Середня | Події + Мітинг + Київстар |
| 7 | `getRegionData` | 🟢 Низький | Висока | Агрегація по всіх менеджерах, потрібен після базових |

## Тестування

Після реалізації кожного action — протестувати в Postman:
```
POST https://[ваш-1с-сервер]/api/handler
Authorization: Basic [login:password]
Content-Type: application/json

{ "action": "getSalesPlan", "payload": { "login": "feshchenko@emet.com", "period": "2026-04" } }
```

Очікуваний результат: `{ "status": "success", "data": { ... } }`

При помилці: `{ "status": "error", "message": "Текст помилки" }`

---

## Контакти

Веб-додаток: https://sales-planning-lyart.vercel.app
Репозиторій: https://github.com/EmetITteam/sales-planning
Документація архітектури: `ARCHITECTURE.md` в корені репозиторію
