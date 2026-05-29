# 05 · Бренд-фільтри

## Як ідентифікувати бренд

При sync з 1С у таблицю `sales` колонка `brand` вже заповнена через regex. Логіка:

```sql
-- При INSERT (або через generated column)
CASE
  WHEN product ILIKE '%HP CELL VITARAN%'
    OR product ILIKE '%хвітаран%' THEN 'Vitaran'
  WHEN product ILIKE '%PETARAN%' THEN 'PETARAN'
  WHEN product ILIKE '%ELLANSE%' THEN 'ELLANSE'
  WHEN product ILIKE '%EXOXE%' THEN 'EXOXE'
  WHEN product ILIKE '%NEURAMIS%' THEN 'NEURAMIS'
  WHEN (product ILIKE '%esse%' OR product ILIKE '%gift set 2026%') THEN 'ESSE'
  WHEN product ILIKE '%marine collagen%' OR product ILIKE '%30 шотів%' OR product ILIKE '%1 шот%'
    THEN 'Collagen'
  ELSE 'Other'
END AS brand
```

> Порядок CASE важливий: бренди з більш специфічними назвами — раніше.

## По кожному бренду — особливості

### 🔵 HP CELL Vitaran
- **Фільтр:** `product ILIKE '%HP CELL VITARAN%'` (case-insensitive)
- **4 типи продукту:**
  - `Vitaran i II` — `product ILIKE '%i ii%'`
  - `Vitaran i` — `product ILIKE '%vitaran i%' AND NOT '%i ii%'`
  - `Vitaran Tox Eye&Face Collagen` — `product ILIKE '%tox eye%' OR '%face collagen%'`
  - `Vitaran Whitening & Anti-aging` — `product ILIKE '%whitening%' OR '%anti-aging%'`
- **Канал:** B2B-важкий (професійний препарат)
- **Тестерів немає** (підтверджено користувачем)

### 🟣 PETARAN POLY PLLA
- **Фільтр:** `product ILIKE '%PETARAN%'`
- **Окрема вигрузка з 1С:** колись був окремий файл з менеджером, але тепер це частина загальної бази
- **Канал:** тільки B2B (B2C і дистриб'ютори фільтруються на стороні 1С-звіту "Представництва")
- **Логіка "Фокуси":** див. [04-cohorts-recency.md](04-cohorts-recency.md)

### 🟢 ESSE (космецевтика)
- **Фільтр:** `product ILIKE '%esse%' OR product ILIKE '%gift set 2026%'`
- **`Gift set 2026`** — окремий подарунковий набір ESSE-продуктів, не містить "esse" у назві але є частиною бренду
- **Виключити:** саше (`'%саше%' OR '%sachet%'`)
- **Канал:** B2C переважає за головами (інтернет-магазин esseskincare = флагман), але B2B приносить більше грошей
- **Підкатегорії продуктів** (через літерно-цифровий код у назві):
  - C-серія (Cleanser/Concealer): `C1`, `C5`, `C7`
  - M-серія (Moisturizer): `M1`, `M2`, `M5`
  - K-серія (Cream Mask): `K5`, `K6`
  - F-серія (Foundation): `F4`
  - R-серія (Serum): `R6`, `R8`, `R11`
  - T-серія, H-серія, S-серія (Sunscreen)
  - O-серія (Omega)
- **Контрольні цифри (на 2026-05-26):**
  - B2B: 983 унік. (А: 386 / С: 191 / В: 415)
  - B2C: 1 946 унік. (А: 493 / С: 556 / В: 900)

### 🟡 IUSE Marine Collagen
- **Фільтр:** `product ILIKE '%marine collagen%' OR '%30 шотів%' OR '%1 шот%'`
- **Два типи:**
  - `30 шотів` — повна упаковка (платна) — рахуємо як покупку
  - `1 шот` — подарунковий проби (sum завжди 0) — НЕ покупка, але можна аналізувати конверсію подарунок → покупка
- **Канал:** B2B-важкий (~70% клієнтів), B2C тримається через лютий-пік
- **Контрольні (2026-01..05-25):**
  - B2B: 320 клієнтів, 2 172 упаковки, $264K
  - B2C: 180 клієнтів, 315 упаковок, $24K

### 🔶 ELLANSE (професійні нитки)
- **Фільтр:** `product ILIKE '%ELLANSE%'`
- **Окремий канал:** є поле "Семінар" і "Проект" у вигрузці — деякі покупки прив'язані до семінару (навчання)
- **Логіка покупка vs навчання:**
  - Чиста покупка = `seminar IS NULL OR seminar = ''`
  - Навчальна покупка = `seminar IS NOT NULL` (придбано в рамках семінару)
- **Канал:** B2B (професійні препарати)

### ⚪ EXOXE / NEURAMIS / решта
- Прості бренд-фільтри по назві (`ILIKE '%EXOXE%'` тощо)
- B2B-важкі

## Cross-brand аналітика

Деякі акції мають подарунок з іншого бренду — наприклад **"EXOXE 1сет + Подарок ESSE tube"**. Це cross-promo:
- Документ містить позицію EXOXE (платна) + позицію ESSE (sum=0, discount містить "EXOXE")
- Можна аналізувати: чи клієнт EXOXE потім купив ESSE окремо ("конвертація з подарунку")

Для cross-promo конверсії використовується підхід **NEW / LOYAL / LOST / COLD**:
- **NEW** — отримав подарунок ESSE, ніколи не купував ESSE раніше, купив після
- **LOYAL** — купував би все одно (купував ESSE до промо)
- **LOST** — отримав, але не купив після (втрачений ліd)
- **COLD** — ніколи не купував ESSE до і після

## How to apply
Коли користувач каже "по ESSE" — застосовувати фільтр бренду + золотий фільтр (saché виключено). Коли "по PETARAN" — фільтр + усвідомити що B2C = 0 (бренд B2B-only). Коли cross-promo — питати або застосовувати NEW/LOYAL/LOST/COLD.
