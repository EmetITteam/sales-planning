-- ============================================================================
-- Migration 054: client_category_history — власний зріз категорій клієнтів
-- (SCD Type 2) з датами + флаг резерву
-- Created 2026-07-16
-- ============================================================================
--
-- КОНТЕКСТ: 1С віддає ЛИШЕ поточну категорію клієнта (Активний/Сплячий/...),
-- без історії. Категорія ставиться на 1-ше число місяця і не змінюється до
-- наступного 1-го. Резерв (галка) може мінятись будь-коли. Ми тримаємо власний
-- зріз, щоб:
--   1) Тижневий звіт читав «Базу»/категорії/резерв з БД миттєво (без 3 викликів
--      1С на менеджера — лишається тільки live-факт Action 3);
--   2) знати категорію КЛІЄНТА НА ДАТУ минулого тижня (для понедельних звітів).
--
-- Джерело: 1С Action 8 (getManagerClients) — повертає і ClientCategory, і
-- isReserved в одному виклику. Наповнює backfill-скрипт + погодинний крон.
--
-- SCD2: одна АКТИВНА версія на клієнта (valid_to IS NULL). При зміні кортежу
-- (category, manager_login, region_code) стара версія закривається (valid_to =
-- дата), відкривається нова. is_reserved — мутабельний флаг (оновлюється на
-- місці, без нової версії). Зниклий у всіх менеджерів клієнт → valid_to = дата.
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_category_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     text        NOT NULL,          -- ClientID з 1С
  client_name   text,                          -- ПІБ (denorm, для дрилдауну/діагностики)
  category      text        NOT NULL,          -- UI-ключ: active|sleeping|lost|new|none
  manager_login text        NOT NULL,          -- поточний менеджер клієнта
  region_code   text        NOT NULL,          -- регіон менеджера (divisionCode)
  is_reserved   boolean     NOT NULL DEFAULT false,  -- галка «Резерв» (мутабельна)
  valid_from    date        NOT NULL,          -- з якої дати версія активна (1-ше для категорії)
  valid_to      date,                          -- NULL = активна; дата = закрита
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_cch_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

COMMENT ON TABLE client_category_history IS
  'SCD2-зріз категорій клієнтів з 1С (Action 8). Одна активна версія на клієнта (valid_to IS NULL). Версія на зміну (category, manager_login, region_code); is_reserved — мутабельний флаг. Наповнює backfill + погодинний крон.';

-- Рівно ОДНА активна версія на клієнта (гарантія цілісності SCD2).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cch_client_active
  ON client_category_history (client_id)
  WHERE valid_to IS NULL;

-- Швидке читання активних клієнтів регіону (База / категорії у звіті).
CREATE INDEX IF NOT EXISTS idx_cch_region_active
  ON client_category_history (region_code)
  WHERE valid_to IS NULL;

-- Запити «категорія клієнта на дату» (історія для минулих тижнів).
CREATE INDEX IF NOT EXISTS idx_cch_client_from
  ON client_category_history (client_id, valid_from);

-- RLS deny-all — як sales/rollup/region-access. Читає лише сервер (service_role).
ALTER TABLE client_category_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY cch_deny_all ON client_category_history
  FOR ALL USING (false) WITH CHECK (false);
