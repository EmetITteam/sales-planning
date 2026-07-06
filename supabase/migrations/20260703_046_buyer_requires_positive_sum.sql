-- ============================================================================
-- Migration 046: buyer = real purchase ($>0) across KPI + category RPCs
-- Created 2026-07-03
-- ============================================================================
--
-- ПРОБЛЕМА: клієнт, що отримав лише БЕЗКОШТОВНИЙ товар ($0) — семпл, шот, або
-- бонус до чужої покупки (напр. повод «VITARAN 6 уп + IUSE SB (СПЕЦ)» — IUSE SB
-- дарують за 6 упаковок Vitaran, sum=$0, але БЕЗ слова «Подарок» → is_gift=false)
-- — рахувався ПОКУПЦЕМ цього бренду. Наприклад IUSE SB·представництва показував
-- 785 «покупців» замість 651 реальних.
--
-- ФІКС (ITD 2026-07-03): покупець бренду = той, хто реально витратив гроші.
-- Додаємо `AND sum_usd > 0` у valid_rows усіх чотирьох метрик-RPC:
--   031 get_kpi_metrics_batch, 034 get_kpi_metrics_averaged,
--   030 get_brand_client_categories, 036 get_brand_channel_categories.
-- Промо-блоки (ТОП-5, реактивація) НЕ чіпаємо — там $0-рядки потрібні для акцій.
--
-- Наслідок: unique_clients / qty / категорії рахують лише реальні покупки;
-- безкоштовні бонуси/семпли не роблять клієнта «покупцем».
-- ============================================================================

-- 1) KPI batch (місяць + YTD)
CREATE OR REPLACE FUNCTION get_kpi_metrics_batch(
  p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_ytd_from TIMESTAMPTZ
)
RETURNS TABLE (
  brand TEXT, channel TEXT,
  period_uc INT, period_qty NUMERIC, period_sum NUMERIC, period_rows INT,
  ytd_uc INT, ytd_qty NUMERIC, ytd_sum NUMERIC, ytd_rows INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH
    valid_rows AS (
      SELECT s.brand, s.channel, s.client_code, s.qty, s.sum_usd, s.sale_date
      FROM sales s
      WHERE s.sale_date >= p_ytd_from AND s.sale_date < p_to
        AND NOT s.is_ignored AND NOT s.is_gift AND NOT s.is_excluded
        AND s.sum_usd > 0                    -- 046: покупець = реальна покупка
        AND s.brand != 'НЕ_МАПНУТО'
    ),
    period_agg AS (
      SELECT v.brand, v.channel,
             COUNT(DISTINCT v.client_code)::INT AS uc,
             SUM(v.qty)::NUMERIC AS qty, SUM(v.sum_usd)::NUMERIC AS sum, COUNT(*)::INT AS rows
      FROM valid_rows v WHERE v.sale_date >= p_from GROUP BY v.brand, v.channel
    ),
    ytd_agg AS (
      SELECT v.brand, v.channel,
             COUNT(DISTINCT v.client_code)::INT AS uc,
             SUM(v.qty)::NUMERIC AS qty, SUM(v.sum_usd)::NUMERIC AS sum, COUNT(*)::INT AS rows
      FROM valid_rows v GROUP BY v.brand, v.channel
    )
  SELECT COALESCE(p.brand, y.brand), COALESCE(p.channel, y.channel),
         COALESCE(p.uc,0), COALESCE(p.qty,0), COALESCE(p.sum,0), COALESCE(p.rows,0),
         COALESCE(y.uc,0), COALESCE(y.qty,0), COALESCE(y.sum,0), COALESCE(y.rows,0)
  FROM period_agg p FULL OUTER JOIN ytd_agg y USING (brand, channel);
END; $$;

-- 2) KPI averaged (квартал/півріччя/рік)
CREATE OR REPLACE FUNCTION get_kpi_metrics_averaged(
  p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_ytd_from TIMESTAMPTZ
)
RETURNS TABLE (
  brand TEXT, channel TEXT,
  period_uc INT, period_qty NUMERIC, period_sum NUMERIC,
  period_avg_qc NUMERIC, period_avg_chk NUMERIC, period_rows INT,
  ytd_uc INT, ytd_qty NUMERIC, ytd_sum NUMERIC, ytd_rows INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH
    valid_rows AS (
      SELECT s.brand, s.channel, s.client_code, s.qty, s.sum_usd, s.sale_date,
             DATE_TRUNC('month', s.sale_date) AS month_key
      FROM sales s
      WHERE s.sale_date >= p_ytd_from AND s.sale_date < p_to
        AND NOT s.is_ignored AND NOT s.is_gift AND NOT s.is_excluded
        AND s.sum_usd > 0                    -- 046: покупець = реальна покупка
        AND s.brand != 'НЕ_МАПНУТО'
    ),
    monthly AS (
      SELECT v.brand, v.channel, v.month_key,
             COUNT(DISTINCT v.client_code)::INT AS uc,
             SUM(v.qty)::NUMERIC AS qty, SUM(v.sum_usd)::NUMERIC AS sum, COUNT(*)::INT AS rows
      FROM valid_rows v WHERE v.sale_date >= p_from GROUP BY v.brand, v.channel, v.month_key
    ),
    period_agg AS (
      SELECT m.brand, m.channel,
             ROUND(AVG(m.uc))::INT AS uc, AVG(m.qty)::NUMERIC AS qty, AVG(m.sum)::NUMERIC AS sum,
             AVG(CASE WHEN m.uc > 0 THEN m.qty / m.uc ELSE 0 END)::NUMERIC AS avg_qc,
             AVG(CASE WHEN m.uc > 0 THEN m.sum / m.uc ELSE 0 END)::NUMERIC AS avg_chk,
             SUM(m.rows)::INT AS rows
      FROM monthly m GROUP BY m.brand, m.channel
    ),
    ytd_agg AS (
      SELECT v.brand, v.channel,
             COUNT(DISTINCT v.client_code)::INT AS uc,
             SUM(v.qty)::NUMERIC AS qty, SUM(v.sum_usd)::NUMERIC AS sum, COUNT(*)::INT AS rows
      FROM valid_rows v GROUP BY v.brand, v.channel
    )
  SELECT COALESCE(p.brand, y.brand), COALESCE(p.channel, y.channel),
         COALESCE(p.uc,0), COALESCE(p.qty,0), COALESCE(p.sum,0),
         COALESCE(p.avg_qc,0), COALESCE(p.avg_chk,0), COALESCE(p.rows,0),
         COALESCE(y.uc,0), COALESCE(y.qty,0), COALESCE(y.sum,0), COALESCE(y.rows,0)
  FROM period_agg p FULL OUTER JOIN ytd_agg y USING (brand, channel);
END; $$;

-- 3) Категорії клієнтів per бренд
CREATE OR REPLACE FUNCTION get_brand_client_categories(
  p_brand TEXT, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ
)
RETURNS TABLE (new_cnt INT, active_cnt INT, sleeping_cnt INT, lost_cnt INT, total_cnt INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH
    valid_rows AS (
      SELECT client_code, sale_date FROM sales
      WHERE brand = p_brand AND sale_date < p_to
        AND NOT is_ignored AND NOT is_gift AND NOT is_excluded
        AND sum_usd > 0                       -- 046: покупець = реальна покупка
    ),
    period_clients AS (
      SELECT v.client_code,
             MAX(CASE WHEN v.sale_date < p_from THEN v.sale_date ELSE NULL END) AS last_before
      FROM valid_rows v
      WHERE EXISTS (SELECT 1 FROM valid_rows v2 WHERE v2.client_code = v.client_code AND v2.sale_date >= p_from)
      GROUP BY v.client_code
    ),
    classified AS (
      SELECT CASE
        WHEN last_before IS NULL THEN 'new'
        WHEN EXTRACT(EPOCH FROM (p_from - last_before)) / 86400 <= 120 THEN 'active'
        WHEN EXTRACT(EPOCH FROM (p_from - last_before)) / 86400 <= 180 THEN 'sleeping'
        ELSE 'lost' END AS category
      FROM period_clients
    )
  SELECT
    COUNT(*) FILTER (WHERE category = 'new')::INT,
    COUNT(*) FILTER (WHERE category = 'active')::INT,
    COUNT(*) FILTER (WHERE category = 'sleeping')::INT,
    COUNT(*) FILTER (WHERE category = 'lost')::INT,
    COUNT(*)::INT
  FROM classified;
END; $$;

-- 4) Категорії клієнтів per бренд × канал
CREATE OR REPLACE FUNCTION get_brand_channel_categories(
  p_brand TEXT, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ
)
RETURNS TABLE (channel TEXT, new_cnt INT, active_cnt INT, sleeping_cnt INT, lost_cnt INT, total_cnt INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH
    valid_rows AS (
      SELECT s.client_code, s.sale_date, s.channel FROM sales s
      WHERE s.brand = p_brand AND s.sale_date < p_to
        AND NOT s.is_ignored AND NOT s.is_gift AND NOT s.is_excluded
        AND s.sum_usd > 0                     -- 046: покупець = реальна покупка
    ),
    period_clients AS (
      SELECT v.client_code,
             MAX(CASE WHEN v.sale_date < p_from THEN v.sale_date ELSE NULL END) AS last_before,
             ARRAY_AGG(DISTINCT v.channel) FILTER (WHERE v.sale_date >= p_from) AS period_channels
      FROM valid_rows v
      WHERE EXISTS (SELECT 1 FROM valid_rows v2 WHERE v2.client_code = v.client_code AND v2.sale_date >= p_from)
      GROUP BY v.client_code
    ),
    per_channel AS (
      SELECT UNNEST(pc.period_channels) AS ch,
             CASE
               WHEN pc.last_before IS NULL THEN 'new'
               WHEN EXTRACT(EPOCH FROM (p_from - pc.last_before)) / 86400 <= 120 THEN 'active'
               WHEN EXTRACT(EPOCH FROM (p_from - pc.last_before)) / 86400 <= 180 THEN 'sleeping'
               ELSE 'lost' END AS category
      FROM period_clients pc
    )
  SELECT pc.ch::TEXT,
         COUNT(*) FILTER (WHERE pc.category = 'new')::INT,
         COUNT(*) FILTER (WHERE pc.category = 'active')::INT,
         COUNT(*) FILTER (WHERE pc.category = 'sleeping')::INT,
         COUNT(*) FILTER (WHERE pc.category = 'lost')::INT,
         COUNT(*)::INT
  FROM per_channel pc GROUP BY pc.ch;
END; $$;

COMMENT ON FUNCTION get_kpi_metrics_batch(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'v046: покупець = реальна покупка (sum_usd > 0). Безкоштовні бонуси/семпли не рахуються.';
