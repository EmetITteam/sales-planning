-- ============================================================================
-- Migration 041: Reactivation — attribute gift money incl. no-«повод» purchases
-- Created 2026-07-03
-- ============================================================================
--
-- ПРОБЛЕМА: подарунок «Esse 200$ + Подарок tube» показував $0, бо покупка, що
-- його принесла, — це ESSE на $200 БЕЗ повода (discount NULL). Функція брала
-- лише рядки з поводом, тож plain-покупка випадала.
--
-- ФІКС: гроші подарунка беремо з УСІХ не-подарункових рядків подарункового
-- документа (тригер-бренд), і з поводом, і без. Логіка ефективного поводу:
--   1) рядок у подарунковому документі (тригер=бренд рядка) → повод подарунка;
--   2) інакше — повод-рядок клієнта, що отримав подарунок під ЦІЄЮ акцією(бренд)
--      (client-level, 039) → повод подарунка;
--   3) інакше — власна знижка;
--   4) plain-рядок без повода і не з подарункового документа → не промо (skip).
--
-- ⚠️ period_rows_all → rows_full (БЕЗ фільтра discount). Додано doc-level dg у
--    promo_effective. Решта — з 040 (representatives-only, history глобальна).
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
    -- Не-подарункові рядки (для brand/channel/cat агрегатів).
    period_rows_ng AS (
      SELECT s.client_code, s.brand, s.channel, s.qty, s.sum_usd, tc.cat
      FROM sales s
      JOIN target_clients tc USING (client_code)
      WHERE s.sale_date >= p_from AND s.sale_date < p_to
        AND NOT s.is_ignored AND NOT s.is_gift AND NOT s.is_excluded
        AND s.channel = 'representatives'
        AND (p_brand IS NULL OR s.brand = p_brand)
    ),
    -- УСІ рядки (подарункові + звичайні, БЕЗ фільтра повода) — для промо-виміру.
    -- base_name = NULL якщо повода немає (plain-покупка).
    rows_full AS (
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
    -- Подарунки per документ: (документ, тригер-бренд) → назва подарункового поводу.
    doc_gifts AS (
      SELECT p.doc_id, p.promo_trigger_brand AS trig, MIN(p.base_name) AS gift_base
      FROM rows_full p
      WHERE p.is_gift AND p.promo_trigger_brand IS NOT NULL
      GROUP BY p.doc_id, p.promo_trigger_brand
    ),
    -- Client-level: клієнт отримав подарунок під акцією P(бренд) → всі його
    -- P(бренд) повод-рядки йдуть у подарунок (навіть з інших документів).
    earn_map AS (
      SELECT p.client_code, p.base_name, p.brand, MIN(dg.gift_base) AS gift_base
      FROM rows_full p
      JOIN doc_gifts dg ON dg.doc_id = p.doc_id AND dg.trig = p.brand
      WHERE NOT p.is_gift AND p.base_name IS NOT NULL
      GROUP BY p.client_code, p.base_name, p.brand
    ),
    promo_effective AS (
      SELECT p.cat, p.client_code, p.qty, p.sum_usd,
             CASE
               WHEN p.is_gift THEN p.base_name
               -- doc-level: будь-який не-подарунковий рядок бренду у подарунковому
               -- документі (вкл. plain без повода) → гроші у подарунок.
               WHEN dg.gift_base IS NOT NULL THEN dg.gift_base
               -- client-level (039): повод-рядок акції, під якою отримав подарунок.
               WHEN em.gift_base IS NOT NULL THEN em.gift_base
               ELSE p.base_name
             END AS k
      FROM rows_full p
      LEFT JOIN doc_gifts dg
        ON dg.doc_id = p.doc_id AND dg.trig = p.brand AND NOT p.is_gift
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
      WHERE pe.k IS NOT NULL   -- plain-покупка без повода і не з подарункового доку → не промо
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
  'Реактивація v8: гроші подарунка беруться і з plain-покупок без повода (doc-level) + client-level повод-рядки (039). Representatives-only (040).';
