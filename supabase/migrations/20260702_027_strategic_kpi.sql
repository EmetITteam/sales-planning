-- ============================================================================
-- Migration 027: Strategic KPI — таргети + продажі line-items
-- Created 2026-07-02
-- ============================================================================
--
-- Дві таблиці:
--   1. `strategic_targets` — річні та місячні цілі per (year × brand × channel).
--      Вводить admin через /admin/strategic-targets. Тільки для itd@emet.in.ua.
--
--   2. `sales` — line-items з 1С (як TSV-вигрузки). Backfill з 2025-01-01+
--      скриптом `scripts/analytics-sales-backfill.mjs`. Далі — nightly sync
--      з 1С через HTTP-endpoint (Action buffer, буде окремо).
--
-- Обидві таблиці RLS deny-all — бекенд читає через service_role.
-- ============================================================================


-- ============================================================================
-- 1. strategic_targets
-- ============================================================================

CREATE TABLE IF NOT EXISTS strategic_targets (
  id               BIGSERIAL PRIMARY KEY,
  year             INT NOT NULL,
  brand            TEXT NOT NULL,          -- 'Vitaran' / 'Neuronox' / 'Ellanse' / ...
  channel          TEXT NOT NULL,          -- 'representatives' / 'call_center' / 'distributors'

  -- Річні цілі
  unique_clients_annual   INT,             -- Унікальні користувачі за рік, чел
  avg_check_annual        NUMERIC(10, 2),  -- Середній чек за рік, $

  -- Місячні цілі
  buyers_monthly          INT,             -- Купують у місяць, чел
  avg_qty_per_client      NUMERIC(6, 2),   -- ср/уп на 1 клієнта, шт

  -- ELLANSE-only (навчання)
  new_trained_annual      INT,             -- Нових обучених у рік, чел
  trainings_annual        INT,             -- Провести навчань у рік, шт
  trainings_repeat        INT,             -- Повторних навчань, шт
  conversion_repeat_pct   NUMERIC(5, 2),   -- Конверсія обучених → повторні (%)
  retention_monthly       INT,             -- Утримання покупаючих у міс., чел

  -- Audit
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       TEXT NOT NULL,

  -- Один рядок per (year × brand × channel)
  CONSTRAINT uniq_year_brand_channel UNIQUE (year, brand, channel),

  CONSTRAINT chk_channel CHECK (
    channel IN ('representatives', 'call_center', 'distributors')
  ),
  CONSTRAINT chk_year CHECK (year >= 2025 AND year <= 2100)
);

COMMENT ON TABLE strategic_targets IS
  'Річні і місячні цілі стратегічних KPI. Один рядок per (рік × бренд × канал). Вводить admin у /admin/strategic-targets.';

CREATE INDEX idx_strategic_targets_year ON strategic_targets (year);
CREATE INDEX idx_strategic_targets_brand ON strategic_targets (brand);

-- RLS deny-all
ALTER TABLE strategic_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY strategic_targets_deny_all ON strategic_targets
  FOR ALL USING (false) WITH CHECK (false);


-- ============================================================================
-- 2. sales — line-items з 1С
-- ============================================================================
--
-- Джерело:
--   Backfill: TSV-вигрузки з 1С (Excel-звіт "Продажи") — імпорт скриптом.
--   Nightly: 1С HTTP POST /api/analytics/sales-sync (буде окремо, ще не готово).
--
-- Дедуплікація: (doc_id, doc_line) — унікальний ключ, upsert логіка при sync.
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales (
  id           BIGSERIAL PRIMARY KEY,
  doc_id       TEXT NOT NULL,              -- 'ЗИН00016140' з 1С
  doc_line     INT NOT NULL,               -- номер рядка у документі (1, 2, 3...)
  sale_date    TIMESTAMPTZ NOT NULL,       -- '2026-06-05 15:18:27'
  client_code  TEXT NOT NULL,              -- '000008266' (з лідуючими нулями)
  client_name  TEXT NOT NULL,
  phone        TEXT,
  product      TEXT NOT NULL,              -- повна назва номенклатури
  discount     TEXT,                       -- 'Neuronox від 3х в асорт. 105$, 200$ -СПЕЦ (05.26)'
  division     TEXT NOT NULL,              -- 'Киев' / 'Одесса' / 'Коллцентр Call center лидогенерация'
  seller       TEXT,                       -- 'Некова Катерина' (Сотрудник)
  seminar      TEXT,                       -- для ELLANSE опційно
  project      TEXT,                       -- для ELLANSE опційно
  qty          NUMERIC(12, 3) NOT NULL,    -- 3.000 (десяткова)
  sum_usd      NUMERIC(12, 2) NOT NULL,    -- 315.00 (може бути 0 = подарунковий рядок)

  -- Обчислювані колонки (в застосунку — уникаємо GENERATED щоб можна було
  -- легко міняти правила без міграції). У backfill/sync скрипт заповнює.
  brand        TEXT NOT NULL,              -- 'Neuronox' / 'Vitaran' / ... / 'НЕ_МАПНУТО'
  channel      TEXT NOT NULL,              -- 'representatives' / 'call_center'
  is_ignored   BOOLEAN NOT NULL DEFAULT FALSE,  -- витратні матеріали, косметика EXOXE
  is_gift      BOOLEAN NOT NULL DEFAULT FALSE,  -- рядок з подарунковим товаром (sum=0 + повод "Подарок")
  gift_brand   TEXT,                       -- бренд подарунка (для промо агрегації)

  -- Audit
  imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id     TEXT,                       -- '2026-06-backfill' / 'nightly-2026-07-02'

  CONSTRAINT uniq_doc_line UNIQUE (doc_id, doc_line),
  CONSTRAINT chk_sales_channel CHECK (channel IN ('representatives', 'call_center'))
);

COMMENT ON TABLE sales IS
  'Line-items продажів з 1С. Backfill з TSV-вигрузок, потім nightly sync. Дедуплікація по (doc_id, doc_line). RLS deny-all.';

CREATE INDEX idx_sales_sale_date ON sales (sale_date);
CREATE INDEX idx_sales_brand ON sales (brand) WHERE NOT is_ignored;
CREATE INDEX idx_sales_channel ON sales (channel) WHERE NOT is_ignored;
CREATE INDEX idx_sales_client_code ON sales (client_code);
-- Індекс date_trunc('month', sale_date) не робимо — date_trunc для timestamptz
-- не IMMUTABLE (залежить від сесійної timezone). Для WHERE sale_date >= X AND
-- sale_date < Y (місячний зріз) достатньо idx_sales_sale_date вище — planner
-- використає його як range scan.

-- RLS deny-all
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_deny_all ON sales
  FOR ALL USING (false) WITH CHECK (false);


-- ============================================================================
-- 3. sales_import_batches — журнал імпортів
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_import_batches (
  id               BIGSERIAL PRIMARY KEY,
  batch_id         TEXT UNIQUE NOT NULL,   -- '2026-06-backfill' / 'nightly-YYYY-MM-DD'
  source           TEXT NOT NULL,          -- 'tsv-manual' / 'onec-http-nightly'
  period_start     DATE,
  period_end       DATE,
  rows_read        INT NOT NULL DEFAULT 0,
  rows_accepted    INT NOT NULL DEFAULT 0,
  rows_ignored     INT NOT NULL DEFAULT 0,
  rows_gift        INT NOT NULL DEFAULT 0,
  rows_excluded    INT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'in_progress',  -- 'in_progress' / 'done' / 'failed'
  error            TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ,
  triggered_by     TEXT NOT NULL,

  CONSTRAINT chk_batch_status CHECK (status IN ('in_progress', 'done', 'failed'))
);

COMMENT ON TABLE sales_import_batches IS
  'Журнал імпортів sales — TSV backfills + nightly sync. Для трасування що коли завантажилось.';

ALTER TABLE sales_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_import_batches_deny_all ON sales_import_batches
  FOR ALL USING (false) WITH CHECK (false);


-- ============================================================================
-- Seed: пусті таргети для 2026 щоб адмінка мала draft-рядки
-- (можна прибрати якщо не хочемо seed — але зручно для першого відкриття UI)
-- ============================================================================
-- Без seed — адмінка сама створює запис на першому save. Простіше.
