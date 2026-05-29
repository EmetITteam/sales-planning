# 01 · Database Schema

## Таблиця `sales` — основна

```sql
CREATE TABLE sales (
  id              BIGSERIAL PRIMARY KEY,
  doc_id          TEXT NOT NULL,              -- 'ЗИН00034345' з 1С
  doc_line        INTEGER NOT NULL,           -- номер рядка в документі (1, 2, 3...)
  sale_date       TIMESTAMPTZ NOT NULL,       -- дата + час реалізації
  client_code     TEXT NOT NULL,              -- '000017247' (з лідуючими нулями!)
  client_name     TEXT NOT NULL,              -- 'Куйдич Ксенія Вікторівна'
  phone           TEXT,                       -- '380990102608'
  product         TEXT NOT NULL,              -- повна назва номенклатури
  discount        TEXT,                       -- 'Ценообразование', 'Рекламная продукция', ...
  seminar         TEXT,                       -- для ELLANSE (може бути порожнє)
  project         TEXT,                       -- для ELLANSE (відрізняється від семінару)
  division        TEXT NOT NULL,              -- 'Киев', 'Интернет магазин esseskincare', ...
  manager         TEXT,                       -- 'Сотрудник' з 1С (може бути порожнє)
  qty             NUMERIC(12, 3) NOT NULL,    -- 1.000, 0.500 — підтримати дроби
  sum_usd         NUMERIC(12, 2) NOT NULL,    -- 1190.00 (мінусові = повернення)

  -- Обчислювані колонки (generated columns)
  brand           TEXT GENERATED ALWAYS AS (
    CASE
      WHEN product ILIKE '%HP CELL VITARAN%' THEN 'Vitaran'
      WHEN product ILIKE '%PETARAN%' THEN 'PETARAN'
      WHEN product ILIKE '%ELLANSE%' THEN 'ELLANSE'
      WHEN product ILIKE '%EXOXE%' THEN 'EXOXE'
      WHEN product ILIKE '%NEURAMIS%' THEN 'NEURAMIS'
      WHEN product ILIKE '%30 шотів%' OR product ILIKE '%1 шот%'
        OR product ILIKE '%marine collagen%' THEN 'Collagen'
      WHEN product ILIKE '%esse%' OR product ILIKE '%gift set 2026%' THEN 'ESSE'
      ELSE 'Other'
    END
  ) STORED,

  segment         TEXT GENERATED ALWAYS AS (
    CASE
      WHEN division IN ('Коллцентр Call center лидогенерация',
                        'Интернет магазин esseskincare')
        THEN 'B2C'
      ELSE 'B2B'
    END
  ) STORED,

  is_advertising  BOOLEAN GENERATED ALWAYS AS (discount = 'Рекламная продукция') STORED,
  is_sachet       BOOLEAN GENERATED ALWAYS AS (
    product ILIKE '%саше%' OR product ILIKE '%sachet%'
  ) STORED,
  is_gift_qty0    BOOLEAN GENERATED ALWAYS AS (sum_usd <= 0.01) STORED,

  -- Метадані
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (doc_id, doc_line)
);

-- Індекси
CREATE INDEX idx_sales_date ON sales (sale_date);
CREATE INDEX idx_sales_client ON sales (client_code);
CREATE INDEX idx_sales_brand_segment ON sales (brand, segment);
CREATE INDEX idx_sales_brand_date ON sales (brand, sale_date);
CREATE INDEX idx_sales_segment_date ON sales (segment, sale_date);
CREATE INDEX idx_sales_division ON sales (division);

-- GIN-індекс на product для пошуку по ILIKE
CREATE INDEX idx_sales_product_trgm ON sales USING gin (product gin_trgm_ops);
-- (потребує EXTENSION pg_trgm)
```

## RLS (Row-Level Security)

Таблиця доступна тільки через service-role (backend). Звичайні користувачі не мають прямого доступу — все через API.

```sql
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- Нікому не дозволено. Доступ — тільки service-role.
CREATE POLICY "no_public_access" ON sales FOR ALL USING (false);
```

## View для зручності (опційно)

```sql
CREATE VIEW sales_clean AS
SELECT *
FROM sales
WHERE sum_usd >= 5
  AND discount IS DISTINCT FROM 'Рекламная продукция'
  AND NOT is_sachet
  AND client_code IS NOT NULL AND client_code != '';
```

Тоді AI у запитах може використовувати `sales_clean` замість писати golden filter кожен раз. Але — менше гнучкості. **Рекомендація:** залишити тільки `sales`, фільтр як частина методології (AI знає).

## Materialized view для recency (продуктивність)

```sql
CREATE MATERIALIZED VIEW client_last_purchase AS
SELECT
  client_code,
  client_name,
  phone,
  brand,
  segment,
  MAX(sale_date)::date AS last_date,
  COUNT(DISTINCT doc_id) AS docs_total,
  SUM(sum_usd) AS sum_total
FROM sales
WHERE sum_usd >= 5
  AND discount IS DISTINCT FROM 'Рекламная продукция'
  AND NOT is_sachet
  AND client_code != ''
GROUP BY client_code, client_name, phone, brand, segment;

CREATE INDEX idx_clp_brand_segment ON client_last_purchase (brand, segment, last_date);
CREATE INDEX idx_clp_last_date ON client_last_purchase (last_date);

-- Оновлювати після кожного sync
REFRESH MATERIALIZED VIEW CONCURRENTLY client_last_purchase;
```

Це дасть швидкі запити "скільки сплячих" без table scan на 100K рядках.

## Окрема таблиця `sales_sync_log` (для моніторингу)

```sql
CREATE TABLE sales_sync_log (
  id              BIGSERIAL PRIMARY KEY,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rows_inserted   INTEGER NOT NULL,
  rows_updated    INTEGER NOT NULL,
  rows_deleted    INTEGER NOT NULL,
  min_date        DATE,
  max_date        DATE,
  duration_ms     INTEGER,
  status          TEXT NOT NULL,              -- 'ok', 'partial', 'error'
  error_message   TEXT
);
```

## Окрема таблиця `analytics_queries` (історія запитів)

```sql
CREATE TABLE analytics_queries (
  id              BIGSERIAL PRIMARY KEY,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id         UUID,                       -- з sales-planning auth
  question        TEXT NOT NULL,
  sql_executed    TEXT,
  response_text   TEXT,
  tokens_input    INTEGER,
  tokens_output   INTEGER,
  cost_usd        NUMERIC(8, 4),              -- для моніторингу витрат API
  duration_ms     INTEGER,
  xlsx_url        TEXT
);

CREATE INDEX idx_aq_user_date ON analytics_queries (user_id, created_at DESC);
```

Це дасть:
- Історію запитів для користувача (можна повторно відкрити)
- Моніторинг витрат на API
- Аналітика самого продукту (які питання задають частіше)

## Backfill процедура

**Однораз при першому запуску:**

```python
# scripts/backfill_sales.py
import pandas as pd
from supabase import create_client

# 1. Парсимо існуючу TSV (логіка з product-analytics/scripts/_collagen_unique_clients.py)
df = parse_tsv('data/База с 01.01.2025.txt', skiprows=21)

# 2. Очищення, перевірка контрольної суми
assert df['sum_usd'].sum().round(2) == 14_090_139.03

# 3. Bulk insert у sales через Supabase
batch_size = 1000
for i in range(0, len(df), batch_size):
    batch = df.iloc[i:i+batch_size].to_dict('records')
    supabase.table('sales').insert(batch).execute()

# 4. Refresh materialized view
supabase.rpc('refresh_client_last_purchase').execute()
```

## Партиціонування (не зараз, але потенційно)

При досягненні ~1M рядків (≈3-5 років даних) — партиціонувати по `sale_date`:

```sql
CREATE TABLE sales (...) PARTITION BY RANGE (sale_date);
CREATE TABLE sales_2025 PARTITION OF sales FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE sales_2026 PARTITION OF sales FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

Для MVP — пропустити.

## Безпека

- ⚠️ Колонки `client_name` і `phone` — PII. Якщо проект масштабується — додати шифрування або обмежити логування цих полів.
- ⚠️ SQL-runner на backend має дозволяти **тільки SELECT**. Жодних INSERT/UPDATE/DELETE/DROP від AI. Реалізація — парсинг SQL і whitelist на початок (`SELECT`, `WITH`).
