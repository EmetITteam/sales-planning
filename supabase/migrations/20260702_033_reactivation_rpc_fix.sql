-- ============================================================================
-- Migration 033: FIX ambiguity у get_reactivation_analytics
-- Created 2026-07-02
-- ============================================================================
--
-- ПРОБЛЕМА: RETURNS TABLE (category TEXT, ...) створює OUT-параметр `category`,
-- який конфліктує з `p.category` / `dim_brand.category` у CTE-запитах →
-- PostgreSQL кидає 42702: "column reference category is ambiguous".
--
-- ФІКС: перейменовую OUT-параметри з префіксом r_ (result_), тоді конфлікт зникає.
-- Аліаси не змінюють імена у JSON-відповіді бо RETURN QUERY повертає по позиції.
-- ============================================================================

DROP FUNCTION IF EXISTS get_reactivation_analytics(TEXT, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION get_reactivation_analytics(
  p_brand TEXT,
  p_from  TIMESTAMPTZ,
  p_to    TIMESTAMPTZ
)
RETURNS TABLE (
  category                 TEXT,
  dimension                TEXT,
  key                      TEXT,
  unique_clients           INT,
  total_qty                NUMERIC,
  total_sum_usd            NUMERIC,
  category_total_sum_usd   NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH
    history AS (
      SELECT s.client_code, MAX(s.sale_date) AS last_before
      FROM sales s
      WHERE s.sale_date < p_from
        AND NOT s.is_ignored AND NOT s.is_gift AND NOT s.is_excluded
      GROUP BY s.client_code
    ),
    period_buyers AS (
      SELECT DISTINCT s.client_code
      FROM sales s
      WHERE s.sale_date >= p_from AND s.sale_date < p_to
        AND NOT s.is_ignored AND NOT s.is_gift AND NOT s.is_excluded
        AND (p_brand IS NULL OR s.brand = p_brand)
    ),
    classified AS (
      SELECT
        pb.client_code,
        CASE
          WHEN h.last_before IS NULL THEN 'new'
          WHEN EXTRACT(EPOCH FROM (p_from - h.last_before))/86400 <= 120 THEN 'active'
          WHEN EXTRACT(EPOCH FROM (p_from - h.last_before))/86400 <= 180 THEN 'sleeping'
          ELSE 'lost'
        END AS cat
      FROM period_buyers pb
      LEFT JOIN history h USING (client_code)
    ),
    target_clients AS (
      SELECT c.client_code, c.cat
      FROM classified c
      WHERE c.cat IN ('new', 'sleeping', 'lost')
    ),
    period_rows_ng AS (
      SELECT s.client_code, s.brand, s.channel, s.qty, s.sum_usd, tc.cat
      FROM sales s
      JOIN target_clients tc USING (client_code)
      WHERE s.sale_date >= p_from AND s.sale_date < p_to
        AND NOT s.is_ignored AND NOT s.is_gift AND NOT s.is_excluded
        AND (p_brand IS NULL OR s.brand = p_brand)
    ),
    period_rows_all AS (
      SELECT s.client_code, s.discount, s.qty, s.sum_usd, tc.cat
      FROM sales s
      JOIN target_clients tc USING (client_code)
      WHERE s.sale_date >= p_from AND s.sale_date < p_to
        AND NOT s.is_ignored AND NOT s.is_excluded
        AND (p_brand IS NULL OR s.brand = p_brand)
        AND s.discount IS NOT NULL AND s.discount != ''
    ),
    cat_totals AS (
      SELECT p.cat, SUM(p.sum_usd)::NUMERIC AS total
      FROM period_rows_ng p
      GROUP BY p.cat
    ),
    dim_brand AS (
      SELECT p.cat, 'brand'::TEXT AS dim, p.brand AS k,
             COUNT(DISTINCT p.client_code)::INT AS uc,
             SUM(p.qty)::NUMERIC AS q,
             SUM(p.sum_usd)::NUMERIC AS s
      FROM period_rows_ng p
      WHERE p_brand IS NULL
      GROUP BY p.cat, p.brand
    ),
    dim_channel AS (
      SELECT p.cat, 'channel'::TEXT AS dim, p.channel AS k,
             COUNT(DISTINCT p.client_code)::INT AS uc,
             SUM(p.qty)::NUMERIC AS q,
             SUM(p.sum_usd)::NUMERIC AS s
      FROM period_rows_ng p
      WHERE p_brand IS NOT NULL
      GROUP BY p.cat, p.channel
    ),
    dim_promo AS (
      SELECT p.cat, 'promo'::TEXT AS dim, p.discount AS k,
             COUNT(DISTINCT p.client_code)::INT AS uc,
             SUM(p.qty)::NUMERIC AS q,
             SUM(p.sum_usd)::NUMERIC AS s
      FROM period_rows_all p
      GROUP BY p.cat, p.discount
    ),
    all_dims AS (
      SELECT * FROM dim_brand
      UNION ALL SELECT * FROM dim_channel
      UNION ALL SELECT * FROM dim_promo
    )
  SELECT
    d.cat::TEXT                          AS category,
    d.dim                                AS dimension,
    d.k                                  AS key,
    d.uc                                 AS unique_clients,
    d.q                                  AS total_qty,
    d.s                                  AS total_sum_usd,
    COALESCE(ct.total, 0)::NUMERIC       AS category_total_sum_usd
  FROM all_dims d
  LEFT JOIN cat_totals ct ON ct.cat = d.cat
  ORDER BY d.cat, d.dim, d.s DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION get_reactivation_analytics(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Реактивація клієнтів per категорія × розріз (brand/channel/promo). Fix v2: короткі внутрішні аліаси щоб уникнути конфлікту з RETURNS TABLE-параметрами.';
