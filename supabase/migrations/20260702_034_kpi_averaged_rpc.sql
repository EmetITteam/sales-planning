-- ============================================================================
-- Migration 034: SQL RPC для усередненого агрегату (квартал/півріччя/рік)
-- Created 2026-07-02
-- ============================================================================
--
-- ПРОБЛЕМА: `aggregatePeriodMetricsAveraged()` для квартал/півріччя/рік у JS
-- тягне 30-120K рядків порційно (30-120 REST-раундів × 300-500 мс).
-- На рік — 4-10 секунд самого мережевого overhead.
--
-- РІШЕННЯ: SQL функція що робить monthly GROUP BY + усереднення на сервері.
-- Повертає period (усереднений) + YTD одразу — узгоджено з migration 031.
-- Для періодів < 2 місяців повертає ті ж значення що get_kpi_metrics_batch.
--
-- Використання:
--   const r = await supabase.rpc('get_kpi_metrics_averaged', {
--     p_from: '2026-04-01Z', p_to: '2026-07-01Z',    // Q2 2026
--     p_ytd_from: '2026-01-01Z',
--   });
-- ============================================================================

CREATE OR REPLACE FUNCTION get_kpi_metrics_averaged(
  p_from     TIMESTAMPTZ,
  p_to       TIMESTAMPTZ,
  p_ytd_from TIMESTAMPTZ
)
RETURNS TABLE (
  brand             TEXT,
  channel           TEXT,
  -- Period (усереднений monthly) — те що показує UI для квартал/півріччя/рік
  period_uc         INT,           -- середнє unique_clients по місяцях
  period_qty        NUMERIC,       -- середнє monthly qty
  period_sum        NUMERIC,       -- середнє monthly sum_usd
  period_avg_qc     NUMERIC,       -- середнє avg_qty_per_client по місяцях
  period_avg_chk    NUMERIC,       -- середнє avg_check_usd по місяцях
  period_rows       INT,
  -- YTD — усі рядки з [p_ytd_from, p_to)
  ytd_uc            INT,
  ytd_qty           NUMERIC,
  ytd_sum           NUMERIC,
  ytd_rows          INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH
    valid_rows AS (
      SELECT s.brand, s.channel, s.client_code, s.qty, s.sum_usd, s.sale_date,
             DATE_TRUNC('month', s.sale_date) AS month_key
      FROM sales s
      WHERE s.sale_date >= p_ytd_from
        AND s.sale_date < p_to
        AND NOT s.is_ignored
        AND NOT s.is_gift
        AND NOT s.is_excluded
        AND s.brand != 'НЕ_МАПНУТО'
    ),
    -- Monthly bucket per (brand × channel × month) — тільки у [p_from, p_to)
    monthly AS (
      SELECT
        v.brand, v.channel, v.month_key,
        COUNT(DISTINCT v.client_code)::INT AS uc,
        SUM(v.qty)::NUMERIC                AS qty,
        SUM(v.sum_usd)::NUMERIC            AS sum,
        COUNT(*)::INT                      AS rows
      FROM valid_rows v
      WHERE v.sale_date >= p_from
      GROUP BY v.brand, v.channel, v.month_key
    ),
    -- Усереднення по місяцях у (brand × channel)
    period_agg AS (
      SELECT
        m.brand, m.channel,
        ROUND(AVG(m.uc))::INT              AS uc,        -- ROUND бо unique_clients ціле
        AVG(m.qty)::NUMERIC                AS qty,
        AVG(m.sum)::NUMERIC                AS sum,
        -- Середнє avg_qty_per_client по місяцях (не sum_qty / sum_clients!)
        AVG(CASE WHEN m.uc > 0 THEN m.qty / m.uc ELSE 0 END)::NUMERIC AS avg_qc,
        AVG(CASE WHEN m.uc > 0 THEN m.sum / m.uc ELSE 0 END)::NUMERIC AS avg_chk,
        SUM(m.rows)::INT                   AS rows
      FROM monthly m
      GROUP BY m.brand, m.channel
    ),
    -- YTD: усі valid_rows (від p_ytd_from до p_to)
    ytd_agg AS (
      SELECT
        v.brand, v.channel,
        COUNT(DISTINCT v.client_code)::INT AS uc,
        SUM(v.qty)::NUMERIC                AS qty,
        SUM(v.sum_usd)::NUMERIC            AS sum,
        COUNT(*)::INT                      AS rows
      FROM valid_rows v
      GROUP BY v.brand, v.channel
    )
  SELECT
    COALESCE(p.brand, y.brand)         AS brand,
    COALESCE(p.channel, y.channel)     AS channel,
    COALESCE(p.uc,      0)             AS period_uc,
    COALESCE(p.qty,     0)             AS period_qty,
    COALESCE(p.sum,     0)             AS period_sum,
    COALESCE(p.avg_qc,  0)             AS period_avg_qc,
    COALESCE(p.avg_chk, 0)             AS period_avg_chk,
    COALESCE(p.rows,    0)             AS period_rows,
    COALESCE(y.uc,      0)             AS ytd_uc,
    COALESCE(y.qty,     0)             AS ytd_qty,
    COALESCE(y.sum,     0)             AS ytd_sum,
    COALESCE(y.rows,    0)             AS ytd_rows
  FROM period_agg p
  FULL OUTER JOIN ytd_agg y USING (brand, channel);
END;
$$;

COMMENT ON FUNCTION get_kpi_metrics_averaged(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Усереднений monthly агрегат per (brand × channel) для квартал/півріччя/рік + YTD. period_* — середнє по місяцях у [p_from, p_to). Використовує idx_sales_valid_date_brand_channel з migration 031.';
