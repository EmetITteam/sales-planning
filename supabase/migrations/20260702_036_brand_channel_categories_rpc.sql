-- ============================================================================
-- Migration 036: RPC — категорії клієнтів per (brand × channel)
-- Created 2026-07-02
-- ============================================================================
--
-- Продовжує migration 030 (per-brand). Тут — розкладка ТЕЖ по каналу:
-- для бренду з КЦ+Представництвами покаже скільки клієнтів кожної
-- категорії у кожному каналі окремо.
--
-- Правила ідентичні 030:
--   classify(client_code) на основі MAX(sale_date) до p_from ЗА ЦИМ БРЕНДОМ
--     (не за channel — глобально по бренду, як і у 030).
--   Далі клієнта відносимо до КОЖНОГО каналу де він купив у періоді.
-- Тобто клієнт що купив і у Представництвах, і в КЦ — потрапляє у обидва
-- канали з тією ж категорією.
--
-- Використання:
--   const r = await supabase.rpc('get_brand_channel_categories', {
--     p_brand: 'IUSE Coll.', p_from: '2026-06-01Z', p_to: '2026-07-01Z',
--   });
-- ============================================================================

CREATE OR REPLACE FUNCTION get_brand_channel_categories(
  p_brand TEXT,
  p_from  TIMESTAMPTZ,
  p_to    TIMESTAMPTZ
)
RETURNS TABLE (
  channel      TEXT,
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
    valid_rows AS (
      SELECT s.client_code, s.sale_date, s.channel
      FROM sales s
      WHERE s.brand = p_brand
        AND s.sale_date < p_to
        AND NOT s.is_ignored
        AND NOT s.is_gift
        AND NOT s.is_excluded
    ),
    -- Для кожного клієнта: класифікація на основі MAX(sale_date < p_from) ГЛОБАЛЬНО
    period_clients AS (
      SELECT
        v.client_code,
        MAX(CASE WHEN v.sale_date < p_from THEN v.sale_date ELSE NULL END) AS last_before,
        -- Множина каналів у які клієнт купив у ПЕРІОДІ
        ARRAY_AGG(DISTINCT v.channel) FILTER (WHERE v.sale_date >= p_from) AS period_channels
      FROM valid_rows v
      WHERE EXISTS (
        SELECT 1 FROM valid_rows v2
        WHERE v2.client_code = v.client_code AND v2.sale_date >= p_from
      )
      GROUP BY v.client_code
    ),
    -- Розгортаємо: клієнт × канал → категорія
    per_channel AS (
      SELECT
        UNNEST(pc.period_channels) AS ch,
        CASE
          WHEN pc.last_before IS NULL THEN 'new'
          WHEN EXTRACT(EPOCH FROM (p_from - pc.last_before)) / 86400 <= 120 THEN 'active'
          WHEN EXTRACT(EPOCH FROM (p_from - pc.last_before)) / 86400 <= 180 THEN 'sleeping'
          ELSE 'lost'
        END AS category
      FROM period_clients pc
    )
  SELECT
    pc.ch::TEXT                                          AS channel,
    COUNT(*) FILTER (WHERE pc.category = 'new')::INT     AS new_cnt,
    COUNT(*) FILTER (WHERE pc.category = 'active')::INT  AS active_cnt,
    COUNT(*) FILTER (WHERE pc.category = 'sleeping')::INT AS sleeping_cnt,
    COUNT(*) FILTER (WHERE pc.category = 'lost')::INT    AS lost_cnt,
    COUNT(*)::INT                                         AS total_cnt
  FROM per_channel pc
  GROUP BY pc.ch;
END;
$$;

COMMENT ON FUNCTION get_brand_channel_categories(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Категорії клієнтів per (channel) для бренду. Класифікація глобальна по бренду (як у get_brand_client_categories), потім розгортається по каналах у яких клієнт купив у періоді.';
