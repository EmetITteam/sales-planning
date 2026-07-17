-- ============================================================================
-- Migration 058: розширити chk_sales_channel до 4 каналів
-- Created 2026-07-17
-- ============================================================================
--
-- detectChannel став 4-канальним: representatives / call_center / distributors
-- / other (див. sales-classifier.ts, коміт fc54626). Старий CHECK на sales.channel
-- дозволяв лише 2 значення → пере-класифікація (scripts/reclassify-channels.mjs)
-- падала з 23514. Розширюємо констрейнт.
--
-- Порядок: спершу ЦЯ міграція, потім `node scripts/reclassify-channels.mjs`.
-- ============================================================================

ALTER TABLE sales DROP CONSTRAINT IF EXISTS chk_sales_channel;
ALTER TABLE sales ADD CONSTRAINT chk_sales_channel
  CHECK (channel IN ('representatives', 'call_center', 'distributors', 'other'));
