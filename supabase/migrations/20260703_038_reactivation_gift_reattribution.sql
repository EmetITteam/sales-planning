-- ============================================================================
-- Migration 038: Reactivation — attribute purchase money to the GIFT promo
-- Created 2026-07-03
-- ============================================================================
--
-- ПРОБЛЕМА: подарункові промо («VITARAN на 700$ + Подарок Marine Collagen»)
-- показують $0, бо самі подарункові рядки коштують $0. А реальні гроші покупки,
-- що принесла подарунок, лежать під звичайною знижкою («-15% від 4х») того ж
-- документа. Тобто підсумок акції з подарунком не видно.
--
-- ЛОГІКА (узгоджено ITD 2026-07-03): якщо у ДОКУМЕНТІ є подарунок з бренд-
-- тригером = бренду грошового рядка, то ці гроші відносимо до ПОДАРУНКОВОГО
-- поводу (не до знижки). Так гроші не дублюються: кожен рядок рахується один раз
-- — або під подарунком (якщо покупка його принесла), або під своєю знижкою.
-- Гроші ІНШОГО бренду без свого подарунка лишаються під своєю знижкою.
--
-- Тригер беремо з колонки `promo_trigger_brand` (проставляє класифікатор на
-- подарункових рядках; бекфіл існуючих — окремим скриптом). Поки колонка NULL —
-- ре-атрибуції немає (безпечно).
--
-- ⚠️ Змінюється period_rows_all (+doc_id/brand/is_gift/trigger/base_name),
--    додано doc_gifts + promo_effective, переписано dim_promo. Решта — з 037.
-- ============================================================================

ALTER TABLE sales ADD COLUMN IF NOT EXISTS promo_trigger_brand TEXT;

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
    -- Всі рядки з поводом (вкл. подарункові $0) + метадані для ре-атрибуції.
    -- base_name = назва без суфікса місяця + суфікс вибраного періоду (037).
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
    -- Подарунки per документ: (документ, тригер-бренд) → назва подарункового поводу.
    doc_gifts AS (
      SELECT p.doc_id, p.promo_trigger_brand AS trig, MIN(p.base_name) AS gift_base
      FROM period_rows_all p
      WHERE p.is_gift AND p.promo_trigger_brand IS NOT NULL
      GROUP BY p.doc_id, p.promo_trigger_brand
    ),
    -- Ефективний повод кожного рядка:
    --   gift-рядок           → власний подарунковий повод;
    --   грошовий, у документі є подарунок з тригером = бренду рядка → повод подарунка;
    --   інакше               → власна знижка.
    promo_effective AS (
      SELECT p.cat, p.client_code, p.qty, p.sum_usd,
             CASE
               WHEN p.is_gift THEN p.base_name
               WHEN dg.gift_base IS NOT NULL THEN dg.gift_base
               ELSE p.base_name
             END AS k
      FROM period_rows_all p
      LEFT JOIN doc_gifts dg
        ON dg.doc_id = p.doc_id AND dg.trig = p.brand AND NOT p.is_gift
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
  'Реактивація v5: гроші покупки, що принесла подарунок, відносяться до подарункового поводу (по promo_trigger_brand у межах документа), без подвоєння. Промо-місяці злиті (037).';
