-- ============================================================================
-- Migration 051: Rollup для Strategic KPI (місячна + кумулятивна YTD агрегація)
-- Created 2026-07-14
-- ============================================================================
--
-- ПРОБЛЕМА: get_kpi_metrics_batch сканує ~150K рядків (YTD Jan→період) і рахує
-- COUNT(DISTINCT client_code) на кожному заході борду → виміряно ~5.5с.
--
-- РІШЕННЯ: передпорахована таблиця `sales_kpi_rollup` — 1 рядок на
-- (year × month × brand × channel). Борд читає крихітну таблицю (~кілька сотень
-- рядків) замість скану 150K → <50мс.
--
-- КОРЕКТНІСТЬ уникальних клієнтів:
--   • sum/qty/rows — аддитивні (YTD = сума місяців).
--   • unique_clients — НЕ аддитивні (клієнт у 2 місяцях задвоївся б).
--   Тому зберігаємо ДВА набори:
--     *_month — метрики цього місяця (COUNT DISTINCT у межах місяця);
--     *_ytd   — КУМУЛЯТИВНІ Jan→цей місяць (COUNT DISTINCT над діапазоном),
--               пораховані у refresh (distinct-скан раз на refresh, не на заход).
--   Рядок існує для (year, month, brand, channel), якщо бренд×канал має валідні
--   продажі у [Jan..month] — тож ytd присутній навіть якщо цього місяця продажів
--   не було (тоді *_month = 0).
--
-- ФІЛЬТР ВАЛІДНОСТІ — 1:1 з get_kpi_metrics_batch (migration 046):
--   NOT is_ignored AND NOT is_gift AND NOT is_excluded AND sum_usd > 0
--   AND brand != 'НЕ_МАПНУТО'
--
-- МЕЖІ МІСЯЦЯ — UTC (борд шле '...T00:00:00Z'). Використовуємо range по
-- sale_date (йде по idx_sales_valid_date_brand_channel), НЕ EXTRACT.
--
-- СПІВІСНУВАННЯ З LIVE (майбутнє): коли доробимо повний live sales-екшен,
-- поточний (відкритий) місяць можна оновлювати частіше — refresh_kpi_rollup
-- перераховує рік із `sales`; достатньо тригерити його після кожного доливу
-- (backfill) або live-оновлення поточного місяця. Закриті місяці незмінні.
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_kpi_rollup (
  year         INT     NOT NULL,
  month        INT     NOT NULL CHECK (month BETWEEN 1 AND 12),
  brand        TEXT    NOT NULL,
  channel      TEXT    NOT NULL,
  -- Метрики САМЕ цього місяця
  uc_month     INT     NOT NULL DEFAULT 0,   -- distinct client_code у місяці
  qty_month    NUMERIC NOT NULL DEFAULT 0,
  sum_month    NUMERIC NOT NULL DEFAULT 0,
  rows_month   INT     NOT NULL DEFAULT 0,
  -- Кумулятивні Jan → цей місяць (для YTD)
  uc_ytd       INT     NOT NULL DEFAULT 0,   -- distinct client_code Jan..month
  qty_ytd      NUMERIC NOT NULL DEFAULT 0,
  sum_ytd      NUMERIC NOT NULL DEFAULT 0,
  rows_ytd     INT     NOT NULL DEFAULT 0,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (year, month, brand, channel)
);

COMMENT ON TABLE sales_kpi_rollup IS
  'Передпорахований rollup для strategic-kpi: місячні + кумулятивні YTD метрики per (year×month×brand×channel). Оновлюється refresh_kpi_rollup() після доливу sales.';

-- RLS deny-all — як у sales. Борд читає через service_role (обходить RLS);
-- anon/authenticated не мають доступу.
ALTER TABLE sales_kpi_rollup ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_kpi_rollup_deny_all ON sales_kpi_rollup
  FOR ALL USING (false) WITH CHECK (false);


-- ============================================================================
-- refresh_kpi_rollup(p_year) — перерахувати весь рік із таблиці sales
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_kpi_rollup(p_year INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  m           INT;
  year_start  TIMESTAMPTZ := make_timestamptz(p_year, 1, 1, 0, 0, 0, 'UTC');
  month_start TIMESTAMPTZ;
  month_end   TIMESTAMPTZ;
BEGIN
  DELETE FROM sales_kpi_rollup WHERE year = p_year;

  FOR m IN 1..12 LOOP
    month_start := make_timestamptz(p_year, m, 1, 0, 0, 0, 'UTC');
    month_end   := month_start + INTERVAL '1 month';

    INSERT INTO sales_kpi_rollup (
      year, month, brand, channel,
      uc_month, qty_month, sum_month, rows_month,
      uc_ytd, qty_ytd, sum_ytd, rows_ytd
    )
    SELECT
      p_year, m, y.brand, y.channel,
      COALESCE(mo.uc, 0), COALESCE(mo.qty, 0), COALESCE(mo.sum, 0), COALESCE(mo.rows, 0),
      y.uc, y.qty, y.sum, y.rows
    FROM (
      -- YTD-агрегат (superset брендів): Jan..поточний місяць
      SELECT s.brand, s.channel,
             COUNT(DISTINCT s.client_code)::INT AS uc,
             SUM(s.qty)::NUMERIC                AS qty,
             SUM(s.sum_usd)::NUMERIC            AS sum,
             COUNT(*)::INT                      AS rows
      FROM sales s
      WHERE s.sale_date >= year_start AND s.sale_date < month_end
        AND NOT s.is_ignored AND NOT s.is_gift AND NOT s.is_excluded
        AND s.sum_usd > 0 AND s.brand != 'НЕ_МАПНУТО'
      GROUP BY s.brand, s.channel
    ) y
    LEFT JOIN (
      -- Місячний агрегат: тільки цей місяць
      SELECT s.brand, s.channel,
             COUNT(DISTINCT s.client_code)::INT AS uc,
             SUM(s.qty)::NUMERIC                AS qty,
             SUM(s.sum_usd)::NUMERIC            AS sum,
             COUNT(*)::INT                      AS rows
      FROM sales s
      WHERE s.sale_date >= month_start AND s.sale_date < month_end
        AND NOT s.is_ignored AND NOT s.is_gift AND NOT s.is_excluded
        AND s.sum_usd > 0 AND s.brand != 'НЕ_МАПНУТО'
      GROUP BY s.brand, s.channel
    ) mo ON mo.brand = y.brand AND mo.channel = y.channel;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION refresh_kpi_rollup(INT) IS
  'Перераховує sales_kpi_rollup за рік із таблиці sales. Викликати після backfill/доливу продажів.';


-- ============================================================================
-- get_kpi_metrics_batch_rollup(p_year, p_month) — читає rollup, повертає
-- ТІ САМІ колонки що get_kpi_metrics_batch (drop-in для місячного view).
-- ============================================================================
CREATE OR REPLACE FUNCTION get_kpi_metrics_batch_rollup(
  p_year  INT,
  p_month INT
)
RETURNS TABLE (
  brand       TEXT,
  channel     TEXT,
  period_uc   INT,
  period_qty  NUMERIC,
  period_sum  NUMERIC,
  period_rows INT,
  ytd_uc      INT,
  ytd_qty     NUMERIC,
  ytd_sum     NUMERIC,
  ytd_rows    INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    r.brand, r.channel,
    r.uc_month, r.qty_month, r.sum_month, r.rows_month,
    r.uc_ytd,   r.qty_ytd,   r.sum_ytd,   r.rows_ytd
  FROM sales_kpi_rollup r
  WHERE r.year = p_year AND r.month = p_month;
$$;

COMMENT ON FUNCTION get_kpi_metrics_batch_rollup(INT, INT) IS
  'Місячні KPI-метрики per (brand×channel) з rollup: period=цей місяць, ytd=Jan..month. Drop-in заміна get_kpi_metrics_batch для одного місяця.';


-- ============================================================================
-- Первинне наповнення за 2026 (rollup читає поточні дані sales)
-- ============================================================================
SELECT refresh_kpi_rollup(2026);
