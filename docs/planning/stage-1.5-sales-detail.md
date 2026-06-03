# Stage 1.5 — Sales Detail Data Foundation (DRAFT)

**Status:** Draft — чекає точний формат полів від користувача (надішле зі скриптів аналітики з інших проектів)
**Date:** 2026-06-02
**Position у плані:** між Stage 1 (Meetings) і Stage 2A (Debtors), іде паралельно з Stage 1 frontend

---

## Призначення

Завантажити **рядкову деталізацію продажів** з 1С у наш Postgres для:

1. **Майбутньої аналітики** (Stage 2A+) — тренди, top-products по клієнту, кореляція з зустрічами
2. **On-demand експорту звітів менеджерам** — щоб не блокувати 1С на кожен ad-hoc-запит
3. **Drill-down на client card** — «що клієнт купував детально» замість тільки brand-сумм
4. **Фундамент для будь-яких future-фіч** які потребують sales line-items (не bands, не segments)

**Зараз у нас є тільки агрегати** (план/факт по бренду, сумма-разом). Цей етап додає реальні рядки.

---

## Стратегія даних

### Бекфіл (one-time)

Завантажуємо з **2025-01-01** до сьогодні через batch action 1С. Обробляємо шматками по місяцях, щоб не перевантажити 1С.

### Інкремент (ongoing)

**Подвійний рівень:**

| Що | Як часто | Чому |
|---|---|---|
| Поточний + попередній місяць — **повне перезавантаження** | Щоночі o 03:00 (Vercel Cron) | У 1С можуть бути правки минулого місяця (корекції, доп. документи) — треба перезаписати |
| Поточний день — **інкремент** | Раз на годину протягом дня (тільки якщо є dashboard споживач) | Для дашбордів «що сьогодні продали» — динаміка дня |
| Все що старше попереднього місяця | Не чіпаємо | Immutable history |

### Idempotent re-sync

Унікальний індекс по `(doc_number_1c, product_id_1c, qty, price_usd)` — якщо 1С повторно відсилає ті ж дані, не дублюємо.

При повному перезавантаженні поточного+попереднього місяця:
1. `DELETE FROM sales_line_items WHERE doc_date >= first_of_prev_month`
2. `INSERT` нові дані з 1С
3. У транзакції — щоб не лишати порожнього вікна

---

## 1С actions (на спеку)

Обидві, паралельно у черзі 1С-розробника:

### `getDetailedSalesBatch(fromDate, toDate, managerLogin?)`

Для backfill + щонічної синки.
- Параметри: період + опційно фільтр по менеджеру
- Очікувана відповідь: масив line-items у форматі що зафіксуємо нижче
- Pagination якщо результат > 5000 рядків (опційно — узгодити з 1С dev)
- Виклик з нашого Vercel Cron worker

### `getDetailedSalesByClient(clientId, fromDate, toDate)`

Для drill-down на client card (швидко, точно по клієнту).
- Параметри: clientId + період
- Очікувана відповідь: масив line-items того ж формату
- Кеш TTL 10 хв (так само як дебіторка, ADR-8)

---

## Схема Postgres (DRAFT — чекає формат користувача)

```sql
CREATE TABLE sales_line_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- з 1С (натуральні ключі для dedup)
  doc_number_1c   text NOT NULL,
  doc_date        date NOT NULL,
  client_id_1c    text NOT NULL,
  manager_login   text NOT NULL,

  -- товар (рядок)
  product_id_1c   text,
  product_name    text NOT NULL,
  segment_code    text,
  brand_code      text,

  -- цифри
  qty             numeric(12,3) NOT NULL,
  price_usd       numeric(12,2),
  discount_pct    numeric(5,2),
  discount_usd    numeric(12,2),
  total_usd       numeric(15,2) NOT NULL,

  -- TODO: ⚠️ ЧЕКАЄ ФОРМАТУ ВІД КОРИСТУВАЧА:
  -- - валюта/курс? (currency, exchange_rate_to_usd)
  -- - тип знижки? (discount_type: promo/contract/manager/volume)
  -- - серії/партії? (batch_number, serial_number, expiry_date)
  -- - PDV окремо?
  -- - інші поля з аналітичних скриптів

  -- метадані синку
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  source_period   text NOT NULL          -- 'backfill' | 'YYYY-MM' (для idempotent re-sync)
);

-- Idempotency: один рядок не може повторитись у двох sync-сесіях
CREATE UNIQUE INDEX idx_sales_uniq ON sales_line_items
  (doc_number_1c, product_id_1c, qty, price_usd);

-- Hot queries
CREATE INDEX idx_sales_client_date ON sales_line_items (client_id_1c, doc_date DESC);
CREATE INDEX idx_sales_manager_date ON sales_line_items (manager_login, doc_date DESC);
CREATE INDEX idx_sales_segment_date ON sales_line_items (segment_code, doc_date DESC);
CREATE INDEX idx_sales_date_brin ON sales_line_items USING BRIN (doc_date);  -- для range-сканів

-- RLS — менеджер бачить тільки свої продажі
ALTER TABLE sales_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_manager_select ON sales_line_items
  FOR SELECT USING (
    manager_login = current_setting('app.login', true)
    OR current_setting('app.role', true) IN ('director', 'admin')
  );
```

---

## Об'єм даних — оцінка

**Припущення (груба):**
- Активних клієнтів: ~1000
- Середня кількість line-items на клієнта в місяць: ~20
- Період: 2025-01-01 → сьогодні (~17 місяців на момент 2026-06)
- Future: ~2 роки активного зростання

| Період | Рядків (груба) | Розмір (≈ 350 байт/рядок) |
|---|---|---|
| Backfill 2025 | 240k | ~85 МБ |
| До 2027 | 480k | ~170 МБ |
| До 2028 (3 роки) | 720k | ~255 МБ |

**Висновок:** Supabase Free 500 МБ → вистачить ~5 років. Pro tier ($25/міс) — індексація + PITR. Перехід на Pro **до Stage 2A** і так рекомендовано (ADR-4 + фінансові дані).

---

## Sprint decomposition (попередній)

| # | Спринт | Сторона | Час | Залежність |
|---|---|---|---|---|
| 1.5.1 | Лок спеки — формат line-item з користувачем, draft 1С actions | Frontend | 0.5 д | **Чекає формат від користувача** |
| 1.5.2 | 1С dev реалізує `getDetailedSalesBatch` + `getDetailedSalesByClient` | 1С | TBD | 1.5.1 |
| 1.5.3 | Migration: `sales_line_items` table + indexes + RLS shadow-mode | Frontend | 1 д | 1.5.2 |
| 1.5.4 | Vercel Cron sync worker — `/api/cron/sync-sales-detail` (poperedni+pochatkovyi місяць) | Frontend | 2 д | 1.5.3 |
| 1.5.5 | One-time backfill скрипт `scripts/backfill-sales-detail.mjs` (2025-01-01 → today, по місяцях з progress logging) | Frontend | 1 д | 1.5.4 |
| 1.5.6 | API endpoint для read-side: `/api/sales-detail/by-client/[id]` (для drill-down) | Frontend | 1 д | 1.5.4 |
| 1.5.7 | Intra-day cron для «сьогодні» (опційно — коли буде dashboard споживач) | Frontend | 0.5 д | пізніше |

**Total frontend:** ~5-6 робочих днів. 1С — окремо у черзі.

**UI у цьому етапі: жоден.** Pure data foundation. UI з'являється у:
- Stage 2A (widget на client card)
- Future analytics dashboards
- On-demand експорти (Excel/CSV через `xlsx` skill)

---

## Open items

- ⏳ **Чекаю формат line-item від користувача** (скрипти аналітики з інших проектів). До цього не можемо завершити схему й написати спеку для 1С.
- 📅 **Intra-day refresh frequency** — раз на годину чи частіше? Залежить від dashboard споживача, який ми ще не спроєктували. Поки сидимо на «щоночі only», ставимо intra-day коли реально буде потреба.
- 🔒 **RLS policy для директора/адміна** — підтвердити що director бачить продажі всіх менеджерів. Поки draft припускає так.
- 🗃️ **Архівація** — коли (якщо взагалі) починаємо чистити старі дані? Поки висновок: 2025+ зберігаємо всі, ревью у 2027.

---

## Залежність від інших етапів

| Етап | Залежність |
|---|---|
| Stage 1 (Meetings) | Незалежні — sales-data не блокує meeting код |
| Stage 2A (Debtors) | **Споживає** — debt+sales = повна фінкартина клієнта |
| Stage 2B (Reclamations) | Незалежні — рекламації у Bitrix |
| Stage 3 (Orders) | Складно — orders це WRITE, sales це READ-історія orders. Може ділити product-каталог 1С actions, але різні теми. |

---

_Документ оновлюється коли користувач надасть точний формат полів. Тоді Stage 1.5 фіналізується і запускається паралельно зі Stage 1 frontend._
