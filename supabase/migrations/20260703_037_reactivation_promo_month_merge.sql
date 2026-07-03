-- ============================================================================
-- Migration 037: Reactivation — merge promo month-suffixes (05.26 + 06.26 → 06)
-- Created 2026-07-03
-- ============================================================================
--
-- Одну й ту саму акцію 1С маркує різними місяцями: «... (05.26)» і «... (06.26)».
-- У блоці «Акції — Реактивація» вони йшли окремими рядками. Треба зливати їх в
-- один рядок і показувати суфіксом ВИБРАНОГО місяця (як у ТОП-5 промо блоці).
--
-- ФІКС: у dim_promo групуємо за назвою БЕЗ суфікса місяця (regexp_replace),
-- а для display key додаємо суфікс періоду (to_char(p_from,'MM.YY')). Оскільки
-- unique_clients = COUNT(DISTINCT client_code) над злитою групою — клієнт, що
-- купував і в 05, і в 06 варіанті, рахується ОДИН раз (без double-count).
--
-- Промо без суфікса місяця лишаються як є.
--
-- ⚠️ Змінюється ТІЛЬКИ CTE dim_promo. Решта функції — з міграції 035.
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
    -- ⭐ 037: групуємо за назвою БЕЗ суфікса місяця, display key — суфікс періоду.
    --   base = прибрати « (MM.YY)» у кінці. Якщо суфікс був — додаємо суфікс
    --   вибраного місяця, інакше лишаємо назву як є.
    dim_promo AS (
      SELECT p.cat, 'promo'::TEXT AS dim,
             CASE
               WHEN p.discount ~ '\(\d{2}\.\d{2}\)\s*$'
                 THEN regexp_replace(p.discount, '\s*\(\d{2}\.\d{2}\)\s*$', '')
                      || ' (' || to_char(p_from AT TIME ZONE 'UTC', 'MM.YY') || ')'
               ELSE p.discount
             END AS k,
             COUNT(DISTINCT p.client_code)::INT AS uc,
             SUM(p.qty)::NUMERIC AS q,
             SUM(p.sum_usd)::NUMERIC AS s
      FROM period_rows_all p
      GROUP BY p.cat,
        CASE
          WHEN p.discount ~ '\(\d{2}\.\d{2}\)\s*$'
            THEN regexp_replace(p.discount, '\s*\(\d{2}\.\d{2}\)\s*$', '')
                 || ' (' || to_char(p_from AT TIME ZONE 'UTC', 'MM.YY') || ')'
          ELSE p.discount
        END
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
  'Реактивація v4: promo-рядки злиті за назвою без суфікса місяця (05.26+06.26 → суфікс вибраного місяця), COUNT(DISTINCT) без double-count клієнтів.';
