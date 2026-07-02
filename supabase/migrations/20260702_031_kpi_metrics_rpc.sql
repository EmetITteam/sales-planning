-- ============================================================================
-- Migration 031: SQL RPC для агрегації метрик per (brand × channel) за
-- період + YTD в одному запиті
-- Created 2026-07-02
-- ============================================================================
--
-- ПРОБЛЕМА: `aggregateBrandChannelMetrics()` + `aggregateYTDMetrics()` у JS
-- тягнуть 12K (місяць) + 85K (YTD Jan-Jul) = ~97 порційних REST-запитів.
-- Разом з мережею це 4-6 секунд на бренд.
--
-- РІШЕННЯ: SQL функція що робить GROUP BY на сервері + повертає одразу
-- period + YTD агрегати. Один запит → ~300-500 мс.
--
-- Партіальний індекс на sale_date + brand + channel уже є через partial
-- index у migration 030 (idx_sales_brand_client_date). Він не покриває
-- (channel, client_code) але PostgreSQL може використати
-- idx_sales_sale_date + фільтр brand у сканному плані.
--
-- Використання:
--   const r = await supabase.rpc('get_kpi_metrics_batch', {
--     p_from: '2026-06-01Z', p_to: '2026-07-01Z',
--     p_ytd_from: '2026-01-01Z',
--   });
-- ============================================================================

-- Індекс для швидкого фільтру за sale_date + brand (партіальний).
CREATE INDEX IF NOT EXISTS idx_sales_valid_date_brand_channel
  ON sales (sale_date, brand, channel, client_code)
  WHERE NOT is_ignored AND NOT is_gift AND NOT is_excluded AND brand != 'НЕ_МАПНУТО';

COMMENT ON INDEX idx_sales_valid_date_brand_channel IS
  'Прискорює агрегації per (brand × channel) з фільтром по sale_date для strategic-kpi. Партіальний — тільки валідні продажі.';


-- ============================================================================
-- RPC функція
-- ============================================================================

CREATE OR REPLACE FUNCTION get_kpi_metrics_batch(
  p_from     TIMESTAMPTZ,
  p_to       TIMESTAMPTZ,
  p_ytd_from TIMESTAMPTZ
)
RETURNS TABLE (
  brand             TEXT,
  channel           TEXT,
  -- Period aggregates ([p_from, p_to))
  period_uc         INT,
  period_qty        NUMERIC,
  period_sum        NUMERIC,
  period_rows       INT,
  -- YTD aggregates ([p_ytd_from, p_to))
  ytd_uc            INT,
  ytd_qty           NUMERIC,
  ytd_sum           NUMERIC,
  ytd_rows          INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH
    -- Валідні рядки з початку YTD до кінця періоду (superset обох діапазонів)
    valid_rows AS (
      SELECT s.brand, s.channel, s.client_code, s.qty, s.sum_usd, s.sale_date
      FROM sales s
      WHERE s.sale_date >= p_ytd_from
        AND s.sale_date < p_to
        AND NOT s.is_ignored
        AND NOT s.is_gift
        AND NOT s.is_excluded
        AND s.brand != 'НЕ_МАПНУТО'
    ),
    -- Період: тільки рядки [p_from, p_to)
    period_agg AS (
      SELECT
        v.brand, v.channel,
        COUNT(DISTINCT v.client_code)::INT AS uc,
        SUM(v.qty)::NUMERIC                AS qty,
        SUM(v.sum_usd)::NUMERIC            AS sum,
        COUNT(*)::INT                      AS rows
      FROM valid_rows v
      WHERE v.sale_date >= p_from
      GROUP BY v.brand, v.channel
    ),
    -- YTD: усі valid_rows (від p_ytd_from до p_to)
    ytd_agg AS (
      SELECT
        v.brand, v.channel,
        COUNT(DISTINCT v.client_code)::INT AS uc,
        SUM(v.qty)::NUMERIC                AS qty,
        SUM(v.sum_usd)::NUMERIC            AS sum,
        COUNT(*)::INT                      AS rows
      FROM valid_rows v
      GROUP BY v.brand, v.channel
    )
  SELECT
    COALESCE(p.brand, y.brand)         AS brand,
    COALESCE(p.channel, y.channel)     AS channel,
    COALESCE(p.uc,   0)                AS period_uc,
    COALESCE(p.qty,  0)                AS period_qty,
    COALESCE(p.sum,  0)                AS period_sum,
    COALESCE(p.rows, 0)                AS period_rows,
    COALESCE(y.uc,   0)                AS ytd_uc,
    COALESCE(y.qty,  0)                AS ytd_qty,
    COALESCE(y.sum,  0)                AS ytd_sum,
    COALESCE(y.rows, 0)                AS ytd_rows
  FROM period_agg p
  FULL OUTER JOIN ytd_agg y USING (brand, channel);
END;
$$;

COMMENT ON FUNCTION get_kpi_metrics_batch(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Метрики per (brand × channel) за період + YTD одним запитом. Валідність: NOT is_ignored AND NOT is_gift AND NOT is_excluded AND brand != НЕ_МАПНУТО.';
