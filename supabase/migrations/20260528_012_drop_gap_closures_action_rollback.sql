-- ROLLBACK M012: повертає колонку gap_closures.action
-- УВАГА: дані НЕ відновлюються (колонка була повністю null до DROP).
-- Лише повертає порожню nullable-колонку, якщо знадобиться сумісність.

ALTER TABLE gap_closures ADD COLUMN IF NOT EXISTS action text;
