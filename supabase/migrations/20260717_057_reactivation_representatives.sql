-- ============================================================================
-- Migration 057: get_reactivation_analytics — тільки канал 'representatives'
-- Created 2026-07-17
-- ============================================================================
--
-- Блок «Акції — реактивація» має рахувати ТІЛЬКИ представництва (8 регіонів).
-- Дистриб'ютори (Полтава/Черновцы), колл-центр і «окремі» (Лазерхауз/Адасса)
-- більше не потрапляють у це полотно — після пере-класифікації каналу
-- (scripts/reclassify-channels.mjs) вони мають channel != 'representatives'.
--
-- Додаємо `s.channel = 'representatives'` у ВСІ скани sales всередині функції:
-- і в історію (класифікація new/sleeping/lost), і в покупців періоду, і в
-- агрегати (бренд/канал/акція). Логіка функції не змінюється — лише периметр.
-- ============================================================================

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
        AND s.channel = 'representatives'
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
        END AS category
      FROM period_buyers pb
      LEFT JOIN history h USING (client_code)
    ),
    target_clients AS (
      SELECT client_code, category
      FROM classified
      WHERE category IN ('new', 'sleeping', 'lost')
    ),
    period_rows_ng AS (
      SELECT s.client_code, s.brand, s.channel, s.qty, s.sum_usd, tc.category
      FROM sales s
      JOIN target_clients tc USING (client_code)
      WHERE s.sale_date >= p_from AND s.sale_date < p_to
        AND NOT s.is_ignored AND NOT s.is_gift AND NOT s.is_excluded
        AND s.channel = 'representatives'
        AND (p_brand IS NULL OR s.brand = p_brand)
    ),
    period_rows_all AS (
      SELECT s.client_code, s.discount, s.qty, s.sum_usd, tc.category
      FROM sales s
      JOIN target_clients tc USING (client_code)
      WHERE s.sale_date >= p_from AND s.sale_date < p_to
        AND NOT s.is_ignored AND NOT s.is_excluded
        AND s.channel = 'representatives'
        AND (p_brand IS NULL OR s.brand = p_brand)
        AND s.discount IS NOT NULL AND s.discount != ''
    ),
    cat_totals AS (
      SELECT category, SUM(sum_usd)::NUMERIC AS total
      FROM period_rows_ng
      GROUP BY category
    ),
    dim_brand AS (
      SELECT category, 'brand'::TEXT AS dim, brand AS key,
             COUNT(DISTINCT client_code)::INT AS uc,
             SUM(qty)::NUMERIC AS qty,
             SUM(sum_usd)::NUMERIC AS sum
      FROM period_rows_ng
      WHERE p_brand IS NULL
      GROUP BY category, brand
    ),
    dim_channel AS (
      SELECT category, 'channel'::TEXT, channel,
             COUNT(DISTINCT client_code)::INT,
             SUM(qty)::NUMERIC,
             SUM(sum_usd)::NUMERIC
      FROM period_rows_ng
      WHERE p_brand IS NOT NULL
      GROUP BY category, channel
    ),
    dim_promo AS (
      SELECT category, 'promo'::TEXT, discount,
             COUNT(DISTINCT client_code)::INT,
             SUM(qty)::NUMERIC,
             SUM(sum_usd)::NUMERIC
      FROM period_rows_all
      GROUP BY category, discount
    ),
    all_dims AS (
      SELECT * FROM dim_brand
      UNION ALL SELECT * FROM dim_channel
      UNION ALL SELECT * FROM dim_promo
    )
  SELECT
    d.category, d.dim, d.key,
    d.uc, d.qty, d.sum,
    COALESCE(ct.total, 0)::NUMERIC AS category_total_sum_usd
  FROM all_dims d
  LEFT JOIN cat_totals ct USING (category)
  ORDER BY d.category, d.dim, d.sum DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION get_reactivation_analytics(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Реактивація клієнтів per категорія × розріз (brand/channel/promo) у [p_from, p_to), ТІЛЬКИ канал representatives (8 регіонів). Класифікація станом на p_from.';
