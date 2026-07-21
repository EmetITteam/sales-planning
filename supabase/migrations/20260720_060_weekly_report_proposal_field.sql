-- ============================================================================
-- Migration 060: weekly_report_notes — додати поле 'proposal' (Пропозиція регіону)
-- Created 2026-07-20
-- ============================================================================
--
-- На карточці бренду у Тижневому звіті РМ вводить «Пропозицію регіону» —
-- вільний текст, понедельно (як Причина/Дія). Розширюємо CHECK на field.
-- ============================================================================

ALTER TABLE weekly_report_notes DROP CONSTRAINT IF EXISTS chk_wrn_field;
ALTER TABLE weekly_report_notes ADD CONSTRAINT chk_wrn_field
  CHECK (field IN ('action', 'reason', 'conclusion', 'promise_check', 'proposal'));
