-- ============================================================================
-- Migration 040: Reactivation — representatives channel only
-- Created 2026-07-03
-- ============================================================================
--
-- Блок «Акції — Реактивація» показував і продажі КОЛЛ-ЦЕНТРА (напр. «ESSE
-- 7000грн+Tube K5,M5,Сумка (ИМ)» — дивізіон «Коллцентр Call center...»).
-- Стратегічна реактивація — це представництва; колл-центр (інтернет-магазин
-- B2C) сюди не потрібен.
--
-- ФІКС: у клієнтах періоду та рядках беремо тільки channel='representatives'.
-- Історію (recency) лишаємо ГЛОБАЛЬНОЮ — щоб давність покупки була справжньою
-- (клієнт, що недавно купив у КЦ, не вважався «втраченим»).
--
-- ⚠️ +AND s.channel='representatives' у period_buyers / period_rows_ng /
--    period_rows_all. Решта — з 039.
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
    -- Історія — ГЛОБАЛЬНА (всі канали), щоб recency була справжньою.
    history AS (
      SELECT s.client_code, MAX(s.sale_date) AS last_before
      FROM sales s
      WHERE s.sale_date < p_from
        AND NOT s.is_ignored AND NOT s.is_gift AND NOT s.is_excluded
      GROUP BY s.client_code
    ),
    -- Купівці періоду — ТІЛЬКИ представництва.
    period_buyers AS (
      SELECT DISTINCT s.client_code
      FROM sales s
      WHERE s.sale_date >= p_from AND s.sale_date < p_to
        AND NOT s.is_ignored AND NOT s.is_gift AND NOT s.is_excluded
        AND s.channel = 'representatives'
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
        AND s.channel = 'representatives'
        AND (p_brand IS NULL OR s.brand = p_brand)
    ),
    period_rows_all AS (
      SELECT s.client_code, s.doc_id, s.brand, s.is_gift, s.promo_trigger_brand,
             s.qty, s.sum_usd, tc.cat,
             CASE
               WHEN s.discount ~ '\(\d{2}\.\d{2}\)\s*$'
                 THEN regexp_replace(s.discount, '\s*\(\d{2}\.\d{2}\)\s*$', '')
                      || ' (' || to_char(p_from AT TIME ZONE 'UTC', 'MM.YY') || ')'
               ELSE s.discount
             END AS base_name
      FROM sales s
      JOIN target_clients tc USING (client_code)
      WHERE s.sale_date >= p_from AND s.sale_date < p_to
        AND NOT s.is_ignored AND NOT s.is_excluded
        AND s.channel = 'representatives'
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
    doc_gifts AS (
      SELECT p.doc_id, p.promo_trigger_brand AS trig, MIN(p.base_name) AS gift_base
      FROM period_rows_all p
      WHERE p.is_gift AND p.promo_trigger_brand IS NOT NULL
      GROUP BY p.doc_id, p.promo_trigger_brand
    ),
    earn_map AS (
      SELECT p.client_code, p.base_name, p.brand, MIN(dg.gift_base) AS gift_base
      FROM period_rows_all p
      JOIN doc_gifts dg ON dg.doc_id = p.doc_id AND dg.trig = p.brand
      WHERE NOT p.is_gift
      GROUP BY p.client_code, p.base_name, p.brand
    ),
    promo_effective AS (
      SELECT p.cat, p.client_code, p.qty, p.sum_usd,
             CASE
               WHEN p.is_gift THEN p.base_name
               WHEN em.gift_base IS NOT NULL THEN em.gift_base
               ELSE p.base_name
             END AS k
      FROM period_rows_all p
      LEFT JOIN earn_map em
        ON em.client_code = p.client_code
       AND em.base_name = p.base_name
       AND em.brand = p.brand
       AND NOT p.is_gift
    ),
    dim_promo AS (
      SELECT pe.cat, 'promo'::TEXT AS dim, pe.k,
             COUNT(DISTINCT pe.client_code)::INT AS uc,
             SUM(pe.qty)::NUMERIC AS q,
             SUM(pe.sum_usd)::NUMERIC AS s
      FROM promo_effective pe
      GROUP BY pe.cat, pe.k
    ),
    cat_total_clients AS (
      SELECT p.cat, '__cat_total__'::TEXT AS dim, ''::TEXT AS k,
             COUNT(DISTINCT p.client_code)::INT AS uc,
             SUM(p.qty)::NUMERIC AS q,
             SUM(p.sum_usd)::NUMERIC AS s
      FROM period_rows_ng p
      GROUP BY p.cat
    ),
    all_dims AS (
      SELECT * FROM cat_total_clients
      UNION ALL SELECT * FROM dim_brand
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
  'Реактивація v7: тільки channel=representatives (колл-центр не показуємо). Історія recency глобальна. + gift re-attribution client-level (039).';
