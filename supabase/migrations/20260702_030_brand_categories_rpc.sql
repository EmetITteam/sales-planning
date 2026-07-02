-- ============================================================================
-- Migration 030: SQL RPC для категорій клієнтів + індекс для GROUP BY per brand
-- Created 2026-07-02
-- ============================================================================
--
-- ПРОБЛЕМА: `getBrandClientCategories` у JS тягне ВСІ рядки бренду з 2022+
-- (~50K для великих брендів), 15 порційних REST-запитів × 500 мс = 10-15 сек.
--
-- РІШЕННЯ: SQL функція що робить GROUP BY на сервері + партіальний індекс.
-- Один запит → ~200-500 мс.
--
-- Використання з клієнта:
--   const r = await supabase.rpc('get_brand_client_categories', {
--     p_brand: 'Vitaran', p_from: '2026-06-01Z', p_to: '2026-07-01Z',
--   });
-- ============================================================================

-- Індекс: (brand, client_code) with sale_date для швидкого GROUP BY
-- Партіальний — виключає ignored/gift/excluded/НЕ_МАПНУТО щоб індекс був
-- меншим і швидшим.
CREATE INDEX IF NOT EXISTS idx_sales_brand_client_date
  ON sales (brand, client_code, sale_date)
  WHERE NOT is_ignored AND NOT is_gift AND NOT is_excluded AND brand != 'НЕ_МАПНУТО';

COMMENT ON INDEX idx_sales_brand_client_date IS
  'Прискорює GROUP BY (brand, client_code) з MAX(sale_date) для категорій клієнтів. Партіальний — тільки валідні продажі.';


-- ============================================================================
-- RPC функція
-- ============================================================================

CREATE OR REPLACE FUNCTION get_brand_client_categories(
  p_brand TEXT,
  p_from  TIMESTAMPTZ,
  p_to    TIMESTAMPTZ
)
RETURNS TABLE (
  new_cnt      INT,
  active_cnt   INT,
  sleeping_cnt INT,
  lost_cnt     INT,
  total_cnt    INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH
    -- Всі валідні рядки бренду до кінця періоду
    valid_rows AS (
      SELECT client_code, sale_date
      FROM sales
      WHERE brand = p_brand
        AND sale_date < p_to
        AND NOT is_ignored
        AND NOT is_gift
        AND NOT is_excluded
    ),
    -- Клієнти які купили у ПЕРІОДІ + їх last_before
    period_clients AS (
      SELECT
        v.client_code,
        MAX(CASE WHEN v.sale_date < p_from THEN v.sale_date ELSE NULL END) AS last_before
      FROM valid_rows v
      WHERE EXISTS (
        SELECT 1 FROM valid_rows v2
        WHERE v2.client_code = v.client_code AND v2.sale_date >= p_from
      )
      GROUP BY v.client_code
    ),
    -- Класифікація
    classified AS (
      SELECT
        CASE
          WHEN last_before IS NULL THEN 'new'
          WHEN EXTRACT(EPOCH FROM (p_from - last_before)) / 86400 <= 120 THEN 'active'
          WHEN EXTRACT(EPOCH FROM (p_from - last_before)) / 86400 <= 180 THEN 'sleeping'
          ELSE 'lost'
        END AS category
      FROM period_clients
    )
  SELECT
    COUNT(*) FILTER (WHERE category = 'new')::INT,
    COUNT(*) FILTER (WHERE category = 'active')::INT,
    COUNT(*) FILTER (WHERE category = 'sleeping')::INT,
    COUNT(*) FILTER (WHERE category = 'lost')::INT,
    COUNT(*)::INT
  FROM classified;
END;
$$;

COMMENT ON FUNCTION get_brand_client_categories(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Категорії клієнтів (нові/активні/сплячі/втрачені) для бренду у [p_from, p_to). Активний ≤ 120 днів, Сплячий 120-180, Втрачений > 180.';

-- Дозвіл виклику через REST (service_role має його автоматично, для anon
-- заборонено — але у нашій системі всі виклики через service_role).
