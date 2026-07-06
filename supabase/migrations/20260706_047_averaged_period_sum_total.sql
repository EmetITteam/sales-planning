-- ============================================================================
-- Migration 047: get_kpi_metrics_averaged повертає РЕАЛЬНУ суму періоду
-- (period_sum_total) окрім усередненої місячної (period_sum)
-- Created 2026-07-06
-- ============================================================================
--
-- ПРОБЛЕМА: для квартал/півріччя/рік метрики усереднюються помісячно
-- (period_sum = AVG(monthly sum)). Але частка ТОП-5 промо у фронті ділить
-- РЕАЛЬНУ суму промо за весь період на цей усереднений total_sum_usd →
-- знаменник у N разів менший → частка завищена ~×3 (квартал) / ~×12 (рік).
--
-- ФІКС (ITD 2026-07-06): додаємо окрему колонку period_sum_total = SUM(monthly
-- sum) — реальна сума факту за весь період (НЕ усереднена). Фронт вживає її як
-- знаменник частки промо (period_total_sum_usd), а period_sum лишається для
-- усереднених метрик-карток. Один місяць: period_sum == period_sum_total.
--
-- Зміна сигнатури RETURNS TABLE → потрібен DROP перед CREATE.
-- ============================================================================

DROP FUNCTION IF EXISTS get_kpi_metrics_averaged(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE FUNCTION get_kpi_metrics_averaged(
  p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_ytd_from TIMESTAMPTZ
)
RETURNS TABLE (
  brand TEXT, channel TEXT,
  period_uc INT, period_qty NUMERIC, period_sum NUMERIC, period_sum_total NUMERIC,
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
             SUM(m.sum)::NUMERIC AS sum_total,     -- 047: реальна сума за весь період
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
         COALESCE(p.uc,0), COALESCE(p.qty,0), COALESCE(p.sum,0), COALESCE(p.sum_total,0),
         COALESCE(p.avg_qc,0), COALESCE(p.avg_chk,0), COALESCE(p.rows,0),
         COALESCE(y.uc,0), COALESCE(y.qty,0), COALESCE(y.sum,0), COALESCE(y.rows,0)
  FROM period_agg p FULL OUTER JOIN ytd_agg y USING (brand, channel);
END; $$;

COMMENT ON FUNCTION get_kpi_metrics_averaged(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'v047: + period_sum_total (реальна сума періоду) для знаменника частки промо. period_sum лишається усередненим.';
