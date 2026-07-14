-- ============================================================================
-- Migration 052: get_kpi_metrics_averaged_rollup — квартал/півріччя/рік з rollup
-- Created 2026-07-14
-- ============================================================================
--
-- Продовження 051: averaged-view (квартал/півріччя/рік) теж читає
-- sales_kpi_rollup замість скану 150K рядків наживо.
--
-- Семантика 1:1 з get_kpi_metrics_averaged (migration 047):
--   period_* — УСЕРЕДНЕНІ по місяцях-з-продажами у діапазоні:
--     • rollup-рядок існує для кожного місяця з першого YTD-продажу (superset),
--       але у місяцях без продажів rows_month=0. Live-RPC AVG рахує ТІЛЬКИ по
--       місяцях з продажами (monthly CTE) → тут фільтр `rows_month > 0` дає
--       рівно ті самі місяці.
--   period_sum_total (047) — РЕАЛЬНА сума періоду = SUM(sum_month), не усереднена.
--   ytd_* — кумулятивні Jan..to_month з rollup-рядка (month = p_to_month).
--
-- Діапазон передаємо як (year, from_month, to_month) — фронт рахує з from/to.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_kpi_metrics_averaged_rollup(
  p_year       INT,
  p_from_month INT,
  p_to_month   INT
)
RETURNS TABLE (
  brand            TEXT,
  channel          TEXT,
  period_uc        INT,
  period_qty       NUMERIC,
  period_sum       NUMERIC,
  period_sum_total NUMERIC,
  period_avg_qc    NUMERIC,
  period_avg_chk   NUMERIC,
  period_rows      INT,
  ytd_uc           INT,
  ytd_qty          NUMERIC,
  ytd_sum          NUMERIC,
  ytd_rows         INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH
    -- Усереднення по місяцях-з-продажами (rows_month > 0 = monthly CTE у live).
    period_agg AS (
      SELECT r.brand, r.channel,
             ROUND(AVG(r.uc_month))::INT                                             AS uc,
             AVG(r.qty_month)::NUMERIC                                               AS qty,
             AVG(r.sum_month)::NUMERIC                                               AS sum,
             SUM(r.sum_month)::NUMERIC                                               AS sum_total,
             AVG(CASE WHEN r.uc_month > 0 THEN r.qty_month / r.uc_month ELSE 0 END)::NUMERIC AS avg_qc,
             AVG(CASE WHEN r.uc_month > 0 THEN r.sum_month / r.uc_month ELSE 0 END)::NUMERIC AS avg_chk,
             SUM(r.rows_month)::INT                                                  AS rows
      FROM sales_kpi_rollup r
      WHERE r.year = p_year
        AND r.month BETWEEN p_from_month AND p_to_month
        AND r.rows_month > 0
      GROUP BY r.brand, r.channel
    ),
    -- YTD = кумулятивний рядок на кінцевий місяць періоду.
    ytd_agg AS (
      SELECT r.brand, r.channel,
             r.uc_ytd AS uc, r.qty_ytd AS qty, r.sum_ytd AS sum, r.rows_ytd AS rows
      FROM sales_kpi_rollup r
      WHERE r.year = p_year AND r.month = p_to_month
    )
  SELECT
    COALESCE(p.brand, y.brand), COALESCE(p.channel, y.channel),
    COALESCE(p.uc, 0), COALESCE(p.qty, 0), COALESCE(p.sum, 0), COALESCE(p.sum_total, 0),
    COALESCE(p.avg_qc, 0), COALESCE(p.avg_chk, 0), COALESCE(p.rows, 0),
    COALESCE(y.uc, 0), COALESCE(y.qty, 0), COALESCE(y.sum, 0), COALESCE(y.rows, 0)
  FROM period_agg p
  FULL OUTER JOIN ytd_agg y USING (brand, channel);
$$;

COMMENT ON FUNCTION get_kpi_metrics_averaged_rollup(INT, INT, INT) IS
  'Averaged KPI (квартал/півріччя/рік) з rollup: period=AVG по місяцях-з-продажами [from..to], ytd=Jan..to. Drop-in заміна get_kpi_metrics_averaged.';
