-- ============================================================================
-- Migration 026: Dynamic plan segments
-- Created 2026-07-01
-- ============================================================================
--
-- Призначення: для конкретних сегментів (перший — NEURONOX) НЕ використовуємо
-- 1С getRegistryPlans, а робимо `planAmount = factAmount` дзеркально. Це
-- корисно коли фізичний залишок товару не дозволяє виставляти реальні плани.
--
-- Правило прив'язане до сегмента + дати «з» (опційно «до»). Історія не
-- зачіпається — тільки поточний і майбутні місяці бачать динамічну заміну.
--
-- Керує admin через /admin/dynamic-plans.
-- ============================================================================

CREATE TABLE IF NOT EXISTS dynamic_plan_segments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_code  text NOT NULL,           -- 'NEURONOX' / 'ESSE' / ...
  enabled_from  date NOT NULL,           -- '2026-07-01' — з цієї дати правило діє
  enabled_to    date,                    -- NULL = безстроково, дата = включно до якої
  strategy      text NOT NULL DEFAULT 'mirror_fact',  -- на майбутнє (плейсхолдер)
  reason        text,                    -- опційна причина (для audit trail)
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_strategy CHECK (strategy IN ('mirror_fact')),
  CONSTRAINT chk_date_range CHECK (enabled_to IS NULL OR enabled_to >= enabled_from)
);

COMMENT ON TABLE dynamic_plan_segments IS
  'Правила динамічного плану — коли planAmount не з 1С а рахується з факту.';

CREATE INDEX idx_dynamic_plan_segment ON dynamic_plan_segments (segment_code);
CREATE INDEX idx_dynamic_plan_active ON dynamic_plan_segments (enabled_from, enabled_to);

-- RLS deny-all — тільки бекенд читає через service_role.
ALTER TABLE dynamic_plan_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY dynamic_plan_deny_all ON dynamic_plan_segments
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON POLICY dynamic_plan_deny_all ON dynamic_plan_segments IS
  'Read/write only через service_role з бекенду.';
