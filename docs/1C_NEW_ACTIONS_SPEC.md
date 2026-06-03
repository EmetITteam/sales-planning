# 1С Specification — нові methods для CRM розширення

> **Версія:** 1.0 від 2026-06-02
> **Адресат:** 1С-розробник EMET
> **Контекст:** Розширення sales-planning у повноцінну CRM. Цей документ покриває **16 нових 1С-actions** через 4 етапи + 1 додатковий action для Add Client. Sister docs: [PROJECT_PLAN.md](./PROJECT_PLAN.md), [1C_API_SPECIFICATION.md](./1C_API_SPECIFICATION.md) (існуючі actions), [planning/best-manager-spec.md](./planning/best-manager-spec.md) (бізнес-логіка Best Manager).
>
> **НІЧОГО не ламаємо у існуючих 13 actions.** Тільки додаємо нові.

---

## Зміст

1. [Загальне](#1-загальне)
2. [Конвенції](#2-конвенції)
3. [Stage 1.5 — Sales Detail (2 actions, найвищий пріоритет)](#3-stage-15--sales-detail-2-actions)
4. [Q3 — Add Client Documents Preview (1 action)](#4-q3--add-client-documents-preview-1-action)
5. [Stage 2A — Receivables / Дебіторка (4 actions)](#5-stage-2a--receivables--дебіторка-4-actions)
6. [Stage 3 — Orders / Замовлення (9 actions)](#6-stage-3--orders--замовлення-9-actions)
7. [Існуючі actions — НЕ ЗМІНЮВАТИ](#7-існуючі-actions--не-змінювати)
8. [Performance вимоги і ліміти](#8-performance-вимоги-і-ліміти)
9. [Testing protocol](#9-testing-protocol)
10. [Open questions для узгодження](#10-open-questions-для-узгодження)

---

## 1. Загальне

### 1.1 Що робимо

Розширюємо існуючий HTTP-сервіс (той самий що працює в Митинг 4.0 і sales-planning) **16-ма новими actions**. Жоден існуючий action не змінюємо у контракті — поведінка sales-planning у проді не повинна постраждати.

### 1.2 Розподіл нових actions по етапах

| Етап | Actions | К-ть | Пріоритет |
|---|---|---|---|
| **Stage 1.5** | `getDetailedSalesBatch`, `getDetailedSalesByClient` | 2 | 🔴 ВИСОКИЙ (відкриває Best Manager + Sales drill-down) |
| **Q3 Add Client docs** | `getClientDocuments` | 1 | 🟡 СЕРЕДНІЙ (потрібен у Stage 1.x Add Client) |
| **Stage 2A** | `getDebtorsByManager`, `getDebtorByClient`, `getReceivablesAging`, `getPaymentHistory` | 4 | 🟡 СЕРЕДНІЙ |
| **Stage 3** | `getCatalog`, `getOrderClients`, `getContracts`, `saveOrder`, `postOrder`, `createRealization`, `getAvailableGifts`, `validateOrder`, `getOrderHistory` | 9 | 🟢 НИЖЧИЙ (через 6-8 тижнів) |

**Рекомендована послідовність роботи для 1С:**
1. Stage 1.5 (2 actions) — найшвидше дає видимий результат у керівництва (Best Manager)
2. Q3 (1 action) — маленький, бистро
3. Stage 2A (4 actions)
4. Stage 3 (9 actions)

---

## 2. Конвенції

### 2.1 Pattern (як для існуючих actions)

```
POST /api/handler
Content-Type: application/json
Authorization: Basic <base64(login:password)>

Запит:    { "action": "назваДії", "payload": { ... } }
Успіх:    { "status": "success", "data": { ... } }
Помилка:  { "status": "error", "message": "Опис помилки", "code": "OPTIONAL_ERROR_CODE" }
```

### 2.2 Дати

- **Дати у форматі ISO:** `YYYY-MM-DD` (наприклад `"2026-06-02"`)
- **Дати+час у форматі ISO:** `YYYY-MM-DDTHH:MM:SS` (наприклад `"2026-06-02T10:30:00"`)

### 2.3 Числа

- **Грошові суми у USD** — number (не string як у деяких existing actions). Наприклад: `1234.56`
- **Кількості (qty)** — number з 3 знаками після коми. Наприклад: `2.000`, `0.500`
- **Відсотки** — number, без `%` (наприклад `15.5` означає 15.5%)

### 2.4 Pagination (для великих відповідей)

Для actions що можуть повертати > 5000 рядків — підтримуйте опціональні параметри:

```json
{
  "action": "...",
  "payload": {
    "...": "...",
    "page": 1,        // optional, default 1
    "pageSize": 5000  // optional, default 5000, max 10000
  }
}
```

Відповідь:
```json
{
  "status": "success",
  "data": {
    "items": [...],
    "page": 1,
    "pageSize": 5000,
    "totalCount": 12345,
    "hasMore": true
  }
}
```

Якщо без pagination — return все одразу, але **попередьте у документації action** про limit (5000 / 10000 / тощо).

### 2.5 Помилки і коди

| Код | Що означає | HTTP-status (якщо застосовується) |
|---|---|---|
| `not_authorized` | Невірний login/password | 401 |
| `not_found` | Сутність не знайдена (clientId, orderId тощо) | 404 |
| `validation_failed` | Payload не пройшов валідацію | 400 |
| `business_rule_failed` | Порушення бізнес-правила (наприклад, restricted product без training) | 422 |
| `onec_unavailable` | Тимчасова недоступність 1С | 503 |
| `internal_error` | Інша помилка | 500 |

### 2.6 Логування у 1С

Будь ласка, логуйте кожен виклик action (action name + login + timestamp + успіх/помилка). Без логів дебаг проблем продакшна стає важким.

---

## 3. Stage 1.5 — Sales Detail (2 actions)

**Чому критично:** Відкриває Best Manager widget (топ-feature для керівництва) + drill-down продажів по клієнтах. Без цих actions Stage 1.5 і Best Manager не зрушать.

**Контекст:** Завантажуємо рядкові продажі з 1С у наш Postgres. Бекфіл — один раз з 2025-01-01 до сьогодні. Інкремент — щоночі (повний current+previous month) + раз на годину (тільки сьогодні).

---

### 3.1 `getDetailedSalesBatch`

#### Призначення

Повертає **всі продажі (line-items) за період**. Використовується для:
1. Бекфілу 2025+ (один раз, шматками по місяцях)
2. Щоночної синхронізації current + previous month
3. Годинної синхронізації поточного дня

#### Payload

```json
{
  "action": "getDetailedSalesBatch",
  "payload": {
    "fromDate": "2026-06-01",         // required, ISO date
    "toDate": "2026-06-02",           // required, ISO date, включно
    "managerLogin": "ivanov@emet.in.ua",  // OPTIONAL — фільтр по конкретному менеджеру; якщо нема — повертаємо всіх
    "page": 1,                        // optional, для pagination
    "pageSize": 5000                  // optional
  }
}
```

#### Response

```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "doc_number_1c": "РЕАЛ-2026-001234",
        "doc_date": "2026-06-02",
        "client_id_1c": "К-00012345",
        "client_name": "ТОВ Клініка «Естет»",
        "client_phone": "+38 044 123 45 67",
        "product_name": "Ellanse M 4x1ml",
        "segment_code": "ELLANSE",            // КРИТИЧНО для Best Manager
        "discount_reason": "Контрактна знижка 15%",
        "discount_pct": 15.0,
        "discount_usd": 75.00,
        "qty": 2.000,
        "price_usd": 250.00,
        "total_usd": 425.00,
        "doc_seminar": null,                  // null/"" якщо не семінар; рядок з ID семінара якщо так
        "doc_project": "Проект EMET 2026",
        "manager_1c": "ivanov@emet.in.ua",    // ⚠️ див. open question O3 (email чи ПІБ?)
        "division": "Київ"
      },
      ...
    ],
    "page": 1,
    "pageSize": 5000,
    "totalCount": 12345,
    "hasMore": true
  }
}
```

#### Поля (детально)

| Поле | Тип | Required | Опис |
|---|---|---|---|
| `doc_number_1c` | string | ✅ | Унікальний номер документа реалізації |
| `doc_date` | date | ✅ | Дата проведення |
| `client_id_1c` | string | ✅ | Код контрагента (для join з нашими таблицями) |
| `client_name` | string | ✅ | Назва контрагента |
| `client_phone` | string | optional | Контактний телефон |
| `product_name` | string | ✅ | Найменування товару (Номенклатура) |
| `segment_code` | string | ✅ | **КРИТИЧНО** — код бренду/ТМ (`ELLANSE` / `PETARAN` / `ESSE` / `IUSE` / `VITARAN` / інші). Без цього Best Manager не працює. Див. open question O1 |
| `discount_reason` | string | optional | Причина/тип знижки |
| `discount_pct` | number | optional | Відсоток знижки |
| `discount_usd` | number | optional | Сума знижки у USD |
| `qty` | number | ✅ | Кількість |
| `price_usd` | number | optional | Ціна за одиницю у USD (до знижки) |
| `total_usd` | number | ✅ | Підсумкова сума у USD (з урахуванням знижки) |
| `doc_seminar` | string\|null | optional | **КРИТИЧНО** — якщо документ-семінар (закупка спікера), то заповнено; інакше null/"". Без цього Best Manager не виключає спікерів |
| `doc_project` | string | optional | Проектна класифікація документа |
| `manager_1c` | string | ✅ | Менеджер відповідальний за клієнта (з `Контрагент.Сотрудник`). Див. open question O3 |
| `division` | string | ✅ | Підрозділ продажу |

#### Edge cases

1. **Період пересікає рік** — повертаємо всі рядки в межах періоду незалежно
2. **Період > 1 місяць** — будь ласка повертайте всі дані; ми використовуємо для бекфілу (бек шматок по місяцях). При більше 10000 рядків — pagination обов'язково
3. **Корекції/правки документів** — повертайте поточний стан (після усіх правок), не журнал
4. **Сторно/відмінений документ** — `total_usd` може бути від'ємним або документ не повертати взагалі. Узгодити з 1С dev
5. **Документ без `segment_code`** — це означає що товар не з 5 ключових ТМ. Можна повертати `"OTHER"` або `null`

#### Performance

- **Очікуваний обсяг:** ~5-10k рядків / місяць
- **Латентність:** до 10 сек для batch на 1 місяць (5-10k рядків)
- **Якщо це не реалістично** — узгодьте з нами розумний pageSize і ми зробимо chunked-завантаження

---

### 3.2 `getDetailedSalesByClient`

#### Призначення

Повертає продажі **конкретного клієнта** за період. Швидше ніж filter `getDetailedSalesBatch` по клієнту, бо 1С може використати індекс по контрагенту. Використовується для drill-down «що клієнт купував» на client card.

#### Payload

```json
{
  "action": "getDetailedSalesByClient",
  "payload": {
    "clientId": "К-00012345",     // required
    "fromDate": "2026-01-01",     // required
    "toDate": "2026-06-02"        // required
  }
}
```

#### Response

Та сама структура що у `getDetailedSalesBatch` без `totalCount` і `hasMore` (бо очікуваний обсяг малий, < 500 рядків на клієнта на рік).

```json
{
  "status": "success",
  "data": {
    "items": [ ... те ж саме що у getDetailedSalesBatch ... ]
  }
}
```

#### Performance

- **Очікуваний обсяг:** до 500 рядків на клієнта за період до 1 року
- **Латентність:** < 1 секунди

---

## 4. Q3 — Add Client Documents Preview (1 action)

**Контекст:** При створенні нового клієнта менеджер у meeting-4.0 завантажував файли (паспорт, диплом, сертифікати навчання — підтвердження кваліфікації лікаря). Ці файли вже зберігаються у 1С. У новій версії sales-planning ми хочемо **показувати ці документи** на картці клієнта (preview), не дублюючи завантаження.

---

### 4.1 `getClientDocuments`

#### Призначення

Повертає список документів прив'язаних до клієнта + URL для перегляду.

#### Payload

```json
{
  "action": "getClientDocuments",
  "payload": {
    "clientId": "К-00012345"
  }
}
```

#### Response

```json
{
  "status": "success",
  "data": {
    "documents": [
      {
        "id": "DOC-00056789",
        "name": "Диплом лікаря.pdf",
        "type": "education",          // optional category: passport / education / certificate / other
        "size": 234567,               // bytes
        "uploadedAt": "2026-04-15T10:30:00",
        "previewUrl": "https://1c.emet.in.ua/api/files/DOC-00056789/preview",
        "downloadUrl": "https://1c.emet.in.ua/api/files/DOC-00056789/download"
      },
      {
        "id": "DOC-00056790",
        "name": "Паспорт.jpg",
        "type": "passport",
        "size": 1234567,
        "uploadedAt": "2026-04-15T10:31:00",
        "previewUrl": "https://1c.emet.in.ua/api/files/DOC-00056790/preview",
        "downloadUrl": "https://1c.emet.in.ua/api/files/DOC-00056790/download"
      }
    ]
  }
}
```

#### Open questions для узгодження

- **Q1.** Як 1С віддає файли? Прямі URL зі своєї системи (потрібна auth для прев'ю)? Чи через base64 stream у відповідь? Чи окремий endpoint `downloadDocument`?
- **Q2.** Категоризація `type` — чи можливо у 1С це визначити (вид документа: паспорт/диплом/сертифікат)? Чи поки повертаємо `"other"` для всіх?
- **Q3.** Якщо файли потребують Basic Auth для перегляду — preview у браузері не спрацює напряму. Тоді нам потрібен endpoint що повертає stream через нашу proxy.

#### Альтернатива (якщо прямі URL не годяться)

Окремий action `downloadClientDocument(documentId)` → повертає base64-encoded payload + mime-type:

```json
{
  "status": "success",
  "data": {
    "id": "DOC-00056789",
    "mimeType": "application/pdf",
    "filename": "Диплом лікаря.pdf",
    "size": 234567,
    "base64": "JVBERi0xLjQK..."   // base64-кодований файл
  }
}
```

**Рекомендація:** обговоримо з вами що зручніше реалізувати з боку 1С.

---

## 5. Stage 2A — Receivables / Дебіторка (4 actions)

**Контекст:** Менеджер має бачити дебіторку своїх клієнтів на client card + у окремому view. Директор бачить агрегати aging. Дані з 1С — джерело правди; ми тільки кешуємо.

---

### 5.1 `getDebtorsByManager`

#### Призначення

Список всіх дебіторів менеджера з aging (за термінами заборгованості).

#### Payload

```json
{
  "action": "getDebtorsByManager",
  "payload": {
    "managerLogin": "ivanov@emet.in.ua",
    "asOfDate": "2026-06-02"   // optional, default = сьогодні
  }
}
```

#### Response

```json
{
  "status": "success",
  "data": {
    "managerLogin": "ivanov@emet.in.ua",
    "asOfDate": "2026-06-02",
    "totals": {
      "totalDebt_usd": 125000.00,
      "overdueDebt_usd": 45000.00,
      "aging": {
        "current": 80000.00,           // не протермінована
        "days_1_30": 25000.00,         // 1-30 днів простроку
        "days_31_60": 12000.00,
        "days_61_90": 5000.00,
        "days_over_90": 3000.00
      }
    },
    "clients": [
      {
        "client_id_1c": "К-00012345",
        "client_name": "ТОВ Клініка «Естет»",
        "total_debt_usd": 12500.00,
        "overdue_debt_usd": 5000.00,
        "aging": {
          "current": 7500.00,
          "days_1_30": 3000.00,
          "days_31_60": 2000.00,
          "days_61_90": 0,
          "days_over_90": 0
        },
        "oldest_debt_date": "2026-04-15"
      }
    ]
  }
}
```

#### Performance

- **Очікуваний обсяг:** до 100 клієнтів на менеджера
- **Латентність:** < 3 сек

---

### 5.2 `getDebtorByClient`

#### Призначення

Деталь дебіторки конкретного клієнта — документи реалізації, оплати, баланси.

#### Payload

```json
{
  "action": "getDebtorByClient",
  "payload": {
    "clientId": "К-00012345",
    "asOfDate": "2026-06-02"     // optional, default = сьогодні
  }
}
```

#### Response

```json
{
  "status": "success",
  "data": {
    "client_id_1c": "К-00012345",
    "client_name": "ТОВ Клініка «Естет»",
    "asOfDate": "2026-06-02",
    "totals": {
      "total_debt_usd": 12500.00,
      "overdue_debt_usd": 5000.00
    },
    "documents": [
      {
        "doc_number_1c": "РЕАЛ-2026-001234",
        "doc_date": "2026-04-15",
        "doc_amount_usd": 5000.00,
        "paid_usd": 0,
        "balance_usd": 5000.00,
        "due_date": "2026-05-15",
        "days_overdue": 18,
        "is_overdue": true
      },
      {
        "doc_number_1c": "РЕАЛ-2026-002345",
        "doc_date": "2026-05-20",
        "doc_amount_usd": 7500.00,
        "paid_usd": 0,
        "balance_usd": 7500.00,
        "due_date": "2026-06-20",
        "days_overdue": 0,
        "is_overdue": false
      }
    ]
  }
}
```

---

### 5.3 `getReceivablesAging`

#### Призначення

Зведена aging-звітність — для дашбордів керівництва (по менеджеру / по регіону / по компанії).

#### Payload

```json
{
  "action": "getReceivablesAging",
  "payload": {
    "asOfDate": "2026-06-02",            // optional, default = сьогодні
    "scope": "company",                  // "manager" | "region" | "company"
    "managerLogin": "ivanov@emet.in.ua", // required якщо scope=manager
    "region": "Київ"                     // required якщо scope=region
  }
}
```

#### Response

```json
{
  "status": "success",
  "data": {
    "scope": "company",
    "asOfDate": "2026-06-02",
    "aging": {
      "current": 1200000.00,
      "days_1_30": 450000.00,
      "days_31_60": 150000.00,
      "days_61_90": 80000.00,
      "days_over_90": 45000.00
    },
    "totalDebt_usd": 1925000.00,
    "overdueDebt_usd": 725000.00,
    "byRegion": [
      { "region": "Київ", "total_debt_usd": 800000.00, "overdue_debt_usd": 200000.00 },
      ...
    ]
  }
}
```

---

### 5.4 `getPaymentHistory`

#### Призначення

Історія платежів клієнта за період — для аналітики «коли платить, як платить».

#### Payload

```json
{
  "action": "getPaymentHistory",
  "payload": {
    "clientId": "К-00012345",
    "fromDate": "2026-01-01",
    "toDate": "2026-06-02"
  }
}
```

#### Response

```json
{
  "status": "success",
  "data": {
    "client_id_1c": "К-00012345",
    "payments": [
      {
        "payment_doc_number": "ПЛАТ-2026-001234",
        "payment_date": "2026-05-20",
        "amount_usd": 5000.00,
        "linked_doc_number": "РЕАЛ-2026-001234",    // optional, на який документ погашення
        "payment_method": "cashless"                  // "cash" | "cashless" | "deferred"
      }
    ]
  }
}
```

---

## 6. Stage 3 — Orders / Замовлення (9 actions)

**Контекст:** Менеджери будуть створювати замовлення (чернетки) і реалізації (проведені) у нашій системі. Поточно це робиться напряму у 1С. Це найбільший етап, 9 actions.

---

### 6.1 `getCatalog`

#### Призначення

Каталог продуктів доступних для заказу — назва, ціна, бренд, обмеження (наприклад, restriction `requires_training=true` для PETARAN).

#### Payload

```json
{
  "action": "getCatalog",
  "payload": {
    "asOfDate": "2026-06-02"    // optional, default = сьогодні (для актуальних цін)
  }
}
```

#### Response

```json
{
  "status": "success",
  "data": {
    "products": [
      {
        "product_id_1c": "ТОВ-00012345",
        "name": "Ellanse M 4x1ml",
        "segment_code": "ELLANSE",
        "price_usd": 250.00,
        "currency": "USD",                  // "USD" | "UAH"
        "is_active": true,
        "is_restricted": false,
        "restriction_reason": null,         // string якщо restricted (наприклад, "Requires PETARAN training")
        "unit": "упаковка",
        "category": "ботокс",               // optional
        "stock_qty": 25                     // optional, скільки в наявності
      }
    ]
  }
}
```

#### Performance

- **Очікуваний обсяг:** ~200-500 продуктів
- **Cache TTL у нашому фронті:** 6 годин (зміни рідкі)

---

### 6.2 `getOrderClients`

#### Призначення

Клієнти доступні **конкретному менеджеру для створення заказу** — фільтр по його закріплених + умови видачі (за платіжною дисципліною тощо).

#### Payload

```json
{
  "action": "getOrderClients",
  "payload": {
    "managerLogin": "ivanov@emet.in.ua"
  }
}
```

#### Response

```json
{
  "status": "success",
  "data": {
    "clients": [
      {
        "client_id_1c": "К-00012345",
        "client_name": "ТОВ Клініка «Естет»",
        "city": "Київ",
        "phone": "+38 044 123 45 67",
        "is_blocked_for_orders": false,
        "block_reason": null,
        "has_active_contract": true,
        "contracts": [    // короткий список контрактів для швидкого вибору
          { "contract_id": "ДОГ-001", "contract_name": "Договір №001 від 15.01.2026", "currency": "UAH" }
        ]
      }
    ]
  }
}
```

---

### 6.3 `getContracts`

#### Призначення

Повний список контрактів клієнта з умовами.

#### Payload

```json
{
  "action": "getContracts",
  "payload": {
    "clientId": "К-00012345"
  }
}
```

#### Response

```json
{
  "status": "success",
  "data": {
    "contracts": [
      {
        "contract_id": "ДОГ-001",
        "contract_name": "Договір №001 від 15.01.2026",
        "start_date": "2026-01-15",
        "end_date": "2027-01-15",
        "currency": "UAH",
        "payment_terms_days": 30,
        "discount_pct": 5.0,
        "is_active": true
      }
    ]
  }
}
```

---

### 6.4 `saveOrder`

#### Призначення

Зберегти **чернетку заказу** у 1С. На цьому етапі заказ ще не проведено.

#### Payload

```json
{
  "action": "saveOrder",
  "payload": {
    "managerLogin": "ivanov@emet.in.ua",
    "clientId": "К-00012345",
    "contractId": "ДОГ-001",
    "deliveryType": "courier",        // "courier" | "pickup" | "nova_poshta" | "manager"
    "deliveryAddress": "вул. Хорива 42, Київ",
    "paymentType": "cashless",        // "cash" | "cashless" | "deferred"
    "comment": "Терміновий заказ під семінар",
    "items": [
      {
        "product_id_1c": "ТОВ-00012345",
        "qty": 5.000,
        "price_usd": 250.00,
        "is_gift": false
      },
      {
        "product_id_1c": "ТОВ-00067890",
        "qty": 1.000,
        "price_usd": 0,
        "is_gift": true             // подарунок (з gift-program)
      }
    ]
  }
}
```

#### Response

```json
{
  "status": "success",
  "data": {
    "order_id_1c": "ЗАК-2026-000123",
    "order_number_1c": "ЗАК00000123",
    "created_at": "2026-06-02T10:30:00",
    "total_amount_usd": 1250.00,
    "status": "draft"
  }
}
```

#### Edge cases

1. **Заказ з заблокованим клієнтом** → error `business_rule_failed`, повертати причину блокування
2. **Restriction-продукт без сертифіката** → error, повертати reason
3. **Знижка > maxAllowed** → error
4. **Currency mismatch** (товар у USD, контракт у UAH) → автоконвертація на стороні 1С

---

### 6.5 `postOrder`

#### Призначення

Перевести заказ з чернетки у **«проведено»** статус у 1С.

#### Payload

```json
{
  "action": "postOrder",
  "payload": {
    "orderId": "ЗАК-2026-000123",
    "managerLogin": "ivanov@emet.in.ua"
  }
}
```

#### Response

```json
{
  "status": "success",
  "data": {
    "order_id_1c": "ЗАК-2026-000123",
    "status": "posted",
    "posted_at": "2026-06-02T10:35:00"
  }
}
```

---

### 6.6 `createRealization`

#### Призначення

Створити документ **реалізації** на основі заказу (фактичний продаж — як коли клієнт оплатив і товар відвантажено).

#### Payload

```json
{
  "action": "createRealization",
  "payload": {
    "orderId": "ЗАК-2026-000123",
    "managerLogin": "ivanov@emet.in.ua",
    "realizationDate": "2026-06-03"   // optional, default = сьогодні
  }
}
```

#### Response

```json
{
  "status": "success",
  "data": {
    "realization_id_1c": "РЕАЛ-2026-001234",
    "realization_number_1c": "РЕАЛ00001234",
    "created_at": "2026-06-03T09:00:00",
    "total_amount_usd": 1250.00
  }
}
```

---

### 6.7 `getAvailableGifts`

#### Призначення

Список подарунків доступних до додавання у заказ (gift-program з обмеженнями типу «при покупці ≥4 уп Vitaran — подарунок ELLANSE 1 уп»).

#### Payload

```json
{
  "action": "getAvailableGifts",
  "payload": {
    "managerLogin": "ivanov@emet.in.ua",
    "clientId": "К-00012345",
    "cartItems": [           // що зараз у корзині — для обчислення available
      { "product_id_1c": "ТОВ-00012345", "qty": 5.000 }
    ]
  }
}
```

#### Response

```json
{
  "status": "success",
  "data": {
    "gifts": [
      {
        "gift_program_id": "GIFT-001",
        "gift_program_name": "При покупці ≥4 уп Ellanse — 1 уп Vitaran",
        "required_condition": "Ellanse ≥ 4 уп",
        "is_eligible": true,
        "gift_products": [
          {
            "product_id_1c": "ТОВ-00067890",
            "name": "Vitaran 1ml",
            "qty_available": 1
          }
        ]
      }
    ]
  }
}
```

---

### 6.8 `validateOrder`

#### Призначення

Pre-validation заказу перед `postOrder` — повертає список помилок/попереджень без створення документа. Для UI-валідації.

#### Payload

Те ж саме що `saveOrder.payload`.

#### Response

```json
{
  "status": "success",
  "data": {
    "is_valid": false,
    "errors": [
      {
        "field": "items[1]",
        "code": "product_restricted",
        "message": "Продукт «PETARAN 2ml» вимагає сертифікат тренінга у менеджера"
      }
    ],
    "warnings": [
      {
        "code": "high_discount",
        "message": "Загальна знижка 18% перевищує типовий рівень (10%) для цього контракту"
      }
    ]
  }
}
```

---

### 6.9 `getOrderHistory`

#### Призначення

Історія заказів клієнта (або менеджера) — для drill-down на client card / manager dashboard.

#### Payload

```json
{
  "action": "getOrderHistory",
  "payload": {
    "clientId": "К-00012345",      // OR managerLogin (одне з двох обов'язково)
    "fromDate": "2026-01-01",
    "toDate": "2026-06-02"
  }
}
```

#### Response

```json
{
  "status": "success",
  "data": {
    "orders": [
      {
        "order_id_1c": "ЗАК-2026-000123",
        "order_number_1c": "ЗАК00000123",
        "client_id_1c": "К-00012345",
        "client_name": "ТОВ Клініка «Естет»",
        "manager_1c": "ivanov@emet.in.ua",
        "order_date": "2026-06-02",
        "status": "posted",                  // "draft" | "posted" | "realized" | "cancelled"
        "total_amount_usd": 1250.00,
        "realization_id_1c": "РЕАЛ-2026-001234"   // якщо створена реалізація
      }
    ]
  }
}
```

---

## 7. Існуючі actions — НЕ ЗМІНЮВАТИ

Ці 13 actions працюють у проді sales-planning і у meeting-4.0. **НЕ ЧІПАТИ контракт.**

| Action | Призначення | Де використовується |
|---|---|---|
| `login` | Auth | sales-planning + meeting |
| `getInitialData` | Зустрічі за період | meeting + sales-planning Stage 1 |
| `saveNewMeeting` | Створення зустрічі | meeting + Stage 1 |
| `updateMeeting` | Оновлення зустрічі | meeting + Stage 1 |
| `startMeeting` | Старт зустрічі + геолокація | meeting + Stage 1 |
| `findClient` | Пошук клієнта | sales-planning + meeting |
| `getManagerClients` | Список клієнтів менеджера | sales-planning + meeting |
| `registerNewClient` | Створення клієнта | meeting + Stage 1.x |
| `getClientReport` | Multi-tab звіт клієнта | sales-planning + meeting |
| `saveClientSurvey` | Анкета клієнта | meeting + Stage 1 |
| `getAllMeetingsForClient` | Історія зустрічей клієнта | sales-planning + meeting |
| `updateMeetingCalendarId` | Прив'язка Google Calendar event ID | meeting + Stage 1 |
| Action 1-7 з [1C_API_SPECIFICATION.md](./1C_API_SPECIFICATION.md) | Sales planning specific | sales-planning |

**Якщо щось треба змінити у контракті** — узгодити окремо, разом з документуванням.

---

## 8. Performance вимоги і ліміти

| Параметр | Значення | Чому |
|---|---|---|
| Час відповіді для action типу «get one» (`getDebtorByClient`, `getDetailedSalesByClient`) | < 1 сек | UI не повинен відчутно лагати |
| Час відповіді для action типу «get batch» (`getDetailedSalesBatch`, `getDebtorsByManager`) | < 10 сек | Викликаємо з cron, можна почекати |
| Час відповіді для action типу «save/post» (`saveOrder`, `postOrder`) | < 3 сек | Менеджер чекає під час кліка |
| Максимальний обсяг відповіді | 10 МБ | Без pagination |
| Pagination обов'язкова якщо > | 10000 рядків | див. секцію 2.4 |
| Concurrent connections з нашого боку | до 10 одночасно | sync workers + UI |

---

## 9. Testing protocol

### 9.1 Як ми будемо тестувати

1. **Postman / cURL** — спочатку перевіряємо що action відповідає правильним JSON
2. **Mock-data** від 1С dev — окрема тестова базу або dev-сервер
3. **Smoke-test** з sales-planning preview-environment перед прод-розкаткою
4. **Прод-canary** — спочатку 1 менеджер, потім всі

### 9.2 Що нам потрібно від 1С dev

- **Sample response** для кожного action (хоча б один реальний приклад)
- **Test environment** (наприклад `1c-test.emet.in.ua` paralelно до prod) щоб не тестувати на проді
- **Документація змін** при найменшому update контракту
- **Логи** на стороні 1С для дебагу

### 9.3 Узгодження rollout

1. 1С dev робить action → дає sample response → ми перевіряємо у Postman
2. Інтегруємо у frontend на feature-branch → preview-deploy
3. Тестуємо на одному реальному клієнті/менеджері
4. Merge у master → прод-canary 1-2 менеджерів
5. Через 3-5 днів → full rollout

---

## 10. Open questions для узгодження

| # | Питання | Який action торкається | Хто відповідає |
|---|---|---|---|
| **O1** | Як 1С позначає бренд (`segment_code`) у line-item продажів? Назва бренду строкою (`"ELLANSE"`) чи якийсь довідник? Якщо немає поля — чи можемо парсити з `product_name`? | `getDetailedSalesBatch`, `getDetailedSalesByClient` | 1С dev + IT Director |
| **O2** | Як визначити що документ-семінар (`doc_seminar`)? Це окреме поле документа реалізації, чи реалізація на специфічний тип контрагента (спікер)? Чи через документ-родонак «Семінар»? | `getDetailedSalesBatch` | 1С dev + Department of Sales |
| **O3** | `manager_1c` — це email менеджера (можна join з `users.login` на нашій стороні) чи ПІБ чи кодний номер з довідника «Сотрудники»? Якщо ПІБ — нам потрібен окремий мапінг | Усі actions з `manager_1c` | 1С dev |
| **O4** | IUSE під-бренди — у 1С Collagen/hair/SB як окремі сегменти чи один `IUSE`? Для Best Manager нам треба сумарно по IUSE | `getDetailedSalesBatch` | 1С dev + Department of Sales |
| **O5** | Як 1С віддає файли клієнта? Прямі URL (з auth)? base64 stream? Окремий endpoint? | `getClientDocuments` | 1С dev |
| **O6** | Категоризація документів — чи можемо віддавати `type` (паспорт/диплом/сертифікат) чи завжди `"other"`? | `getClientDocuments` | 1С dev |
| **O7** | Сторно/відмінені документи реалізації — повертати у `getDetailedSalesBatch` чи виключати? Якщо повертати — як їх відрізнити (status?, від'ємні суми?) | `getDetailedSalesBatch` | 1С dev |
| **O8** | Чи є у 1С поняття «restriction для продукту» (PETARAN потребує training) як прапорець `is_restricted` + причина? Чи це окрема система? | `getCatalog`, `validateOrder` | 1С dev + Department of Sales |
| **O9** | Gift programs (наприклад, «при ≥4 уп Vitaran — подарунок ELLANSE») — як це налаштовується у 1С? Є довідник «Подарункові програми»? | `getAvailableGifts` | 1С dev + Department of Sales |
| **O10** | Currency conversion — товар у USD, контракт у UAH. На якій стороні робиться: 1С автоматично при `saveOrder`, чи нам передавати currency-converted ціни? | `saveOrder`, `getCatalog` | 1С dev |

---

## 11. Контакти

- **Frontend / архітектура спеки:** IT-команда EMET
- **Бізнес-логіка Best Manager + sales detail:** Department of Sales (через IT Director)
- **1С реалізація:** 1С-розробник EMET

---

_Документ оновлюється при будь-якому узгодженому розширенні/корекції контракту. Поточна версія 1.0 (2026-06-02)._
