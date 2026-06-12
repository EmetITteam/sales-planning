# 📚 Блок «Адміністрація семінарів» — план впровадження

**Узгоджено:** 2026-06-12
**Старт:** наступний тиждень (понеділок 2026-06-15+)
**Гілка:** `feature/seminars` (окрема від master)
**Merge strategy:** squash → 1 чистий commit у master після завершення кожної phase

---

## 🎯 Бізнес-задача

Замінити Excel-таблицю обліку семінарів повноцінним модулем у sales-planning з функціями:

1. **Каталог семінарів** по регіонах (з 1С `getTrainings`)
2. **Запис клієнта на семінар** менеджером
3. **Контроль умов закупок** з 1С (автоматичний по реалізаціях з тегом мероприятия)
4. **Список умов** для участі (вища/середня мед.освіта + сертифікат PLA/PCL/HaCa + закупка від $640 за період)
5. **Список доступних семінарів по регіонах** з заповненістю
6. **Формування списків з підтвердженням участі** (2 рівні: pre-registered → confirmed)
7. **Інтеграція з заповненістю груп** для РМ/director
8. **Forecast** «плани на семінари по категоріях на наступні місяці»
9. **Список моделей** для лікарів-учасників (50% з 1С + 50% сторонні)

---

## 🏛 Архітектурні рішення (зафіксовані)

### Що зберігаємо де

| Шар | Дані |
|-----|------|
| **1С (source of truth)** | Каталог семінарів (`getTrainings`), умови (вкладка «Условия»), реалізації з тегом мероприятия, освіта/документи клієнтів |
| **Supabase (наш операційний шар)** | seminars (кеш + override), seminar_conditions (mirror з 1С або manual), seminar_registrations, seminar_models, кеш перевірок умов |
| **Sales-planning UI** | 6 нових сторінок з різними permission levels |

### Підхід до умов: ГІБРИД

- **Фаза 1:** адмінка для умов (вручну вводимо найбільш важливі семінари)
- **Фаза 2:** sync з 1С коли розробник додасть Action 14
- **Перевірка закупок:** обов'язково через 1С (по реалізаціях клієнта з тегом, не сумарно по бренду)

### Два рівні реєстрації

```
pre_registered  →  confirmed  →  attended / no_show / cancelled
   (менеджер)      (черговий)        (день семінару)
```

---

## 🗃 Схема БД (5 нових таблиць)

```sql
-- Migration 025: seminars + seminar_conditions
seminars
├── id BIGSERIAL PRIMARY KEY
├── onec_training_id TEXT UNIQUE NOT NULL    -- 4670 з 1С
├── topic TEXT NOT NULL                       -- "ELLANSE Step 2 ..."
├── brand_segment TEXT                        -- "ELLANSE" / "IUSE" / "NEURAMIS"
├── date DATE NOT NULL
├── region_code TEXT NOT NULL                 -- KYV, ODS, тощо
├── max_participants INTEGER DEFAULT 6
├── location TEXT                             -- адреса
├── comment_from_1c TEXT
├── duty_manager_logins TEXT[]                -- ['kr.kiev@...', 'sm.kiev1@...']
├── status TEXT DEFAULT 'planned'             -- planned/registration_open/closed/done/cancelled
├── synced_with_1c_at TIMESTAMPTZ
└── created_at, updated_at

seminar_conditions
├── id BIGSERIAL
├── seminar_id FK seminars
├── nomenclature TEXT NOT NULL                -- "_ELLANSE"
├── min_amount NUMERIC NOT NULL               -- 640
├── date_from DATE NOT NULL
├── date_to DATE NOT NULL
├── source TEXT CHECK ('1c_sync','manual')
└── created_at, updated_at

-- Migration 026: seminar_registrations + seminar_models
seminar_registrations
├── id BIGSERIAL
├── seminar_id FK
├── client_id_1c TEXT NOT NULL
├── client_name TEXT NOT NULL                 -- snapshot
├── manager_login TEXT NOT NULL               -- хто привів
├── buyer_name TEXT                           -- "Від кого закупка" якщо інше
├── status TEXT DEFAULT 'pre_registered'
│   CHECK IN ('pre_registered','confirmed','attended','no_show','cancelled')
├── prepayment BOOLEAN DEFAULT false
├── participation_confirmed BOOLEAN DEFAULT false
├── parking_needed BOOLEAN
├── meal_type TEXT CHECK IN ('meat','no_meat','vegetarian')
├── comment TEXT
-- Перевірка умов
├── conditions_met BOOLEAN
├── conditions_check_method TEXT CHECK IN ('auto_1c','manual')
├── conditions_details JSONB                  -- результат Action 15
├── conditions_checked_at TIMESTAMPTZ
└── registered_at, updated_at, registered_by
   UNIQUE (seminar_id, client_id_1c)

seminar_models
├── id BIGSERIAL
├── seminar_id FK
├── model_name TEXT NOT NULL
├── model_phone TEXT
├── client_id_1c TEXT                         -- NULLABLE (50% сторонні)
├── doctor_for TEXT                           -- "Гриша Альона"
├── procedure_time TIME
├── manager_login TEXT
└── created_at, updated_at

-- Migration 027 (Phase 2): кеш перевірок (опційне)
seminar_purchases_check_cache
├── client_id_1c, seminar_id
├── result JSONB
├── checked_at
└── TTL 24h (через scheduled cleanup)
```

---

## 🔌 API endpoints (12 нових)

```
GET    /api/seminars                          список майбутніх (фільтри по регіону)
GET    /api/seminars/[id]                     деталь + reg + models + conditions
POST   /api/seminars/sync                     адмін: запустити sync getTrainings
POST   /api/seminars/[id]/register            записати клієнта
PATCH  /api/seminar-registrations/[id]        update (confirm/logistics/comment)
DELETE /api/seminar-registrations/[id]        зняти з реєстрації
POST   /api/seminars/[id]/check-conditions    запустити Action 15 (Phase 2)
GET    /api/seminars/[id]/models              список моделей
POST   /api/seminars/[id]/models              додати модель
DELETE /api/seminar-models/[id]               видалити модель
GET    /api/seminars/dashboard                для РМ/director — agg + forecast
GET    /api/seminars/[id]/export              CSV/XLSX для логістики
```

---

## 🎨 Сторінки UI (6 нових)

| URL | Хто | Що бачить |
|-----|-----|-----------|
| `/seminars` | менеджер+ | Каталог майбутніх семінарів у своєму регіоні |
| `/seminars/[id]` | менеджер+ | Деталь семінару + умови + список записаних + кнопка «Записати клієнта» |
| `/seminars/[id]/manage` | черговий+ | Управління реєстраціями: підтвердження, логістика (обід/паркомісце), коментарі |
| `/seminars/[id]/models` | черговий+ | Додавання/редагування моделей для лікарів-учасників |
| `/seminars/admin` | РМ+director | Overview: заповненість всіх семінарів, forecast, алерти |
| `/admin/seminars` | admin | Адмінка: редактор умов вручну, призначення duty_managers, sync з 1С |

Плюс бейдж на картці клієнта у `/clients`: **«Записаний на семінар 25.06»**

---

## 🛡 Permissions

| Дія | Менеджер | Черговий | РМ | Director | Admin |
|-----|----------|----------|----|----|-------|
| Бачити каталог свого регіону | ✅ | ✅ | ✅ | ✅ | ✅ |
| Бачити каталог інших регіонів | ❌ | ❌ | ✅ | ✅ | ✅ |
| Записати клієнта | ✅ (свого) | ✅ | ✅ | ✅ | ✅ |
| Підтвердити участь | ❌ | ✅ (своїх семінарів) | ✅ | ✅ | ✅ |
| Управляти моделями | ❌ | ✅ | ✅ | ✅ | ✅ |
| Бачити overview-дашборд | ❌ | ❌ | ✅ (регіон) | ✅ | ✅ |
| Управляти умовами | ❌ | ❌ | ❌ | ❌ | ✅ |
| Sync з 1С | ❌ | ❌ | ❌ | ✅ | ✅ |

---

## 🔌 Залежність від 1С-розробника

**Action 14: `getSeminarConditions(trainingId)`**
- Вхід: `trainingId` (код 1С довідника)
- Вихід: масив `[{nomenclature, brand, minAmount, dateFrom, dateTo}]`
- Логіка: простий витяг вкладки «Условия» довідника «Виды обучения»

**Action 15: `checkClientSeminarPurchases(clientId, trainingId)`** — **критично**
- Вхід: `clientId`, `trainingId`
- Вихід:
  ```json
  {
    "conditions": [
      {
        "nomenclature": "_ELLANSE",
        "required": 640,
        "actualSeminarRelevant": 720,
        "passed": true,
        "invoices": [
          { "id": "...", "date": "...", "amount": 360, "hasSeminarTag": true }
        ]
      }
    ],
    "allConditionsMet": true
  }
  ```
- Логіка: фільтрувати реалізації клієнта по тегу мероприятия за період, рахувати по номенклатурі

**Без цих двох actions автоматика перевірки умов не запрацює — лише ручні галочки чергових менеджерів.**

Детальне ТЗ для розробника — окремий документ [ONEC_ACTIONS_14_15_SPEC.md](./ONEC_ACTIONS_14_15_SPEC.md).

---

## 📅 Розклад фаз

### Phase 1 — MVP (5-6 робочих днів)

**Залежність:** немає, можемо стартувати одразу. 1С Action 14+15 — не блокер для MVP (умови вручну в адмінці).

| День | Що |
|------|-----|
| 1 | Migration 025-026 + ETALON tag + types + 4 базові API endpoints |
| 2 | `/seminars` каталог + sync getTrainings + кеш у seminars |
| 3 | `/seminars/[id]` деталь + dialog запису + 2 рівні статусу |
| 4 | `/seminars/[id]/manage` для чергових + логістика (обід/паркомісце) |
| 5 | `/admin/seminars` редактор умов + permissions check + бейдж на картці клієнта |
| 6 | Список моделей + тестування + ETALON tag + документація |

**Merge у master:** Squash commit «Sprint 3A: Seminars Phase 1 MVP» з повним описом.

### Phase 2 — Sync умов + автоперевірка (3-4 дні)

**Залежність:** 1С-розробник зробив Action 14 + 15.

| День | Що |
|------|----|
| 1 | API wrapper для Action 14+15 + кеш-таблиця purchases_check (migration 027) |
| 2 | Інтеграція в dialog запису (показ результату перевірки автоматично) |
| 3 | Бейдж «умови виконані / не виконані» у списку учасників |
| 4 | Notification «у клієнта Х умови вже виконані, запропонуйте семінар» |

### Phase 3 — Аналітика РМ/Director (4-5 днів)

**Залежність:** Phase 1 завершена.

| День | Що |
|------|----|
| 1 | `/seminars/admin` overview-сторінка з заповненістю |
| 2 | Forecast на місяці + drill-down по регіонах і брендах |
| 3 | Алерти «менше 50% за 7 днів» + notification |
| 4 | Excel-export (учасники + логістика) |
| 5 | Звіти «План vs Факт по семінарах» + dashboard widget на головній |

**Сумарно:** 12-15 робочих днів повністю (~3 робочі тижні)

---

## 🌿 Workflow на feature-гілці

1. **Перед стартом (понеділок ранок):**
   - Я роблю ETALON tag поточного master як точку відкоту
   - Я створюю `feature/seminars` з master
   - Vercel автоматично починає деплоїти preview URL
   - **Ти:** включаєш Preview Password Protection у Vercel (Settings → Deployment Protection)

2. **Під час розробки:**
   - Усі комміти Phase 1 — у `feature/seminars`
   - Push до GitHub → Vercel деплоїть preview
   - Тестуємо на preview URL з тестовим менеджером (наприклад моя сесія)
   - Master лишається стабільним

3. **Завершення кожної phase:**
   - Squash merge у master через PR на GitHub або CLI
   - 1 чистий commit у master з повним описом
   - ETALON tag після merge
   - Vercel автоматично оновлює production

4. **Якщо щось зламано:**
   - Master не зачеплений — користувачі продовжують працювати
   - Можемо `git revert` merge commit або відкочуватись до ETALON

---

## ⚠️ Відкриті питання / залежності

| Що | Стан | Якщо не вирішено |
|----|------|-------------------|
| 1С Action 14 (getSeminarConditions) | ⏳ ТЗ передати розробнику | Phase 2 не стартує. Phase 1 працює з ручною адмінкою |
| 1С Action 15 (checkClientSeminarPurchases) | ⏳ ТЗ передати | Те саме |
| Як заводимо **duty_managers**? Хто це призначає? | ❓ | Default: адмін у `/admin/seminars`. Альтернатива — РМ. Уточнити перед стартом Phase 1 |
| Минулі семінари (історичні дані) | ❓ | Default: ігноруємо, рахуємо з дати запуску. Альтернатива — bulk-import з Excel |
| `region_code` менеджера для каталогу | OK | Беремо з `session.regionCode`. Для multi-region РМ — overrides з `MULTI_REGION_RM_OVERRIDES` |

---

## 📋 Підсумок: що треба зробити

### **З моєї сторони (sales-planning)**
- 5 нових Supabase таблиць + RLS (migrations 025-027)
- 12 API endpoints
- 6 нових сторінок UI
- Бейдж на картці клієнта в `/clients`
- Permissions guard для 4 ролей
- Адмінка для умов і duty_managers
- Документація: розділ у `manual.html` для менеджера + окрема інструкція `seminars-manual.html` для чергових

### **З сторони 1С-розробника**
- Action 14: `getSeminarConditions(trainingId)` — простіше
- Action 15: `checkClientSeminarPurchases(clientId, trainingId)` — складніше (фільтр по тегу мероприятия)

### **З твоєї сторони**
- Передати ТЗ 1С-розробнику (готовий markdown у [ONEC_ACTIONS_14_15_SPEC.md](./ONEC_ACTIONS_14_15_SPEC.md))
- Узгодити список duty_managers — хто призначає?
- Включити Preview Password Protection у Vercel перед стартом
- Підтвердити сценарій з минулими семінарами (ігноруємо чи bulk-import)

---

## 🔗 Пов'язані документи

- [ONEC_ACTIONS_14_15_SPEC.md](./ONEC_ACTIONS_14_15_SPEC.md) — ТЗ для 1С-розробника
- [BACKLOG.md](./BACKLOG.md) — загальний беклог
- [audit-2026-06-11.md](./audit-2026-06-11.md) — попередній аудит (стан проєкту)
