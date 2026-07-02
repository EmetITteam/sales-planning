-- ============================================================================
-- Migration 032: RPC для блоку «Акції — Реактивація категорій»
-- Created 2026-07-02
-- ============================================================================
--
-- Для 3-х категорій клієнтів (Нові / Сплячі / Втрачені) — куди вони
-- «прийшли/повернулися» у обраному періоді. Класифікація станом на p_from.
--
-- Правила (як у migration 030 + categories.ts):
--   Нові:     не мали жодної валідної non-gift покупки до p_from
--   Активні:  остання ≤ 120 днів (виключаємо з реактивації-блоку)
--   Сплячі:   остання 120 < days ≤ 180
--   Втрачені: остання > 180 днів
--
-- Для кожної категорії → два розрізи:
--   1) по бренду/каналу (dim='brand' або 'channel' коли p_brand задано)
--   2) по акціях (dim='promo' — text з sales.discount)
--
-- Використання:
--   const r = await supabase.rpc('get_reactivation_analytics', {
--     p_brand: 'Vitaran', p_from: '2026-06-01Z', p_to: '2026-07-01Z',
--   });
-- ============================================================================

-- Індекс для history-CTE (MAX(sale_date) per client_code)
CREATE INDEX IF NOT EXISTS idx_sales_client_date_valid
  ON sales (client_code, sale_date)
  WHERE NOT is_ignored AND NOT is_gift AND NOT is_excluded;

COMMENT ON INDEX idx_sales_client_date_valid IS
  'Прискорює GROUP BY client_code + MAX(sale_date) для класифікації клієнтів у Реактивація-блоці.';


CREATE OR REPLACE FUNCTION get_reactivation_analytics(
  p_brand TEXT,
  p_from  TIMESTAMPTZ,
  p_to    TIMESTAMPTZ
)
RETURNS TABLE (
  category                 TEXT,        -- 'new' | 'sleeping' | 'lost'
  dimension                TEXT,        -- 'brand' | 'channel' | 'promo'
  key                      TEXT,        -- brand-name / channel-code / discount text
  unique_clients           INT,
  total_qty                NUMERIC,
  total_sum_usd            NUMERIC,
  category_total_sum_usd   NUMERIC      -- для % — сума ВСІЄЇ категорії у періоді
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH
    -- 1. Валідні non-gift рядки до p_from — для класифікації (MAX per клієнт)
    history AS (
      SELECT s.client_code, MAX(s.sale_date) AS last_before
      FROM sales s
      WHERE s.sale_date < p_from
        AND NOT s.is_ignored AND NOT s.is_gift AND NOT s.is_excluded
      GROUP BY s.client_code
    ),
    -- 2. Клієнти що купили у [p_from, p_to). Якщо задано p_brand — тільки цей бренд.
    period_buyers AS (
      SELECT DISTINCT s.client_code
      FROM sales s
      WHERE s.sale_date >= p_from AND s.sale_date < p_to
        AND NOT s.is_ignored AND NOT s.is_gift AND NOT s.is_excluded
        AND (p_brand IS NULL OR s.brand = p_brand)
    ),
    -- 3. Класифікація тих клієнтів
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
    -- Тільки категорії які нас цікавлять
    target_clients AS (
      SELECT client_code, category
      FROM classified
      WHERE category IN ('new', 'sleeping', 'lost')
    ),
    -- 4. Всі покупки цих клієнтів у періоді (для агрегації).
    --    Для «по акціях» беремо ТЕЖ gift-рядки (там може бути discount tag),
    --    для «по брендах/каналах» — тільки non-gift (не рахуємо gift як покупку бренду).
    period_rows_ng AS (
      SELECT s.client_code, s.brand, s.channel, s.qty, s.sum_usd, tc.category
      FROM sales s
      JOIN target_clients tc USING (client_code)
      WHERE s.sale_date >= p_from AND s.sale_date < p_to
        AND NOT s.is_ignored AND NOT s.is_gift AND NOT s.is_excluded
        AND (p_brand IS NULL OR s.brand = p_brand)
    ),
    -- Для акцій — включаємо gift-рядки (як у promos.ts) щоб побачити gift-only промо
    period_rows_all AS (
      SELECT s.client_code, s.discount, s.qty, s.sum_usd, tc.category
      FROM sales s
      JOIN target_clients tc USING (client_code)
      WHERE s.sale_date >= p_from AND s.sale_date < p_to
        AND NOT s.is_ignored AND NOT s.is_excluded
        AND (p_brand IS NULL OR s.brand = p_brand)
        AND s.discount IS NOT NULL AND s.discount != ''
    ),
    -- 5. Сума кожної категорії для % розрахунку
    cat_totals AS (
      SELECT category, SUM(sum_usd)::NUMERIC AS total
      FROM period_rows_ng
      GROUP BY category
    ),
    -- 6. Розрізи
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
  'Реактивація клієнтів per категорія × розріз (brand/channel/promo) у [p_from, p_to). Класифікація станом на p_from. p_brand=NULL → dim=brand; p_brand=X → dim=channel.';
