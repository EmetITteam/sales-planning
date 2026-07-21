-- ============================================================================
-- Migration 061: focus_participants — учасники фокусу на місяць (снапшот з 1С)
-- Created 2026-07-20
-- ============================================================================
--
-- Хто у фокусі по бренду за місяць. Заповнюється кроном (sync-focus) пару разів
-- на день: обхід менеджерів (Action 5 → Action 8 список клієнтів → getClientFocus
-- focusName), focusName → бренд-сегмент. Тижневий звіт ЧИТАЄ цю таблицю (не
-- дьоргає 1С наживо) — «N учасників у фокусі» по бренду × регіон.
--
-- Один рядок = (період × клієнт × сегмент). Фіксується на місяць; крон замінює
-- зріз успішних менеджерів. Купили-по-фокусу рахуємо окремо з таблиці sales.
-- ============================================================================

CREATE TABLE IF NOT EXISTS focus_participants (
  period        text        NOT NULL,          -- 'YYYY-MM'
  client_id     text        NOT NULL,          -- ClientID 1С
  segment_code  text        NOT NULL,          -- бренд-сегмент з focusName (VITARAN, IUSE…)
  focus_name    text,                          -- сирий focusName
  manager_login text,                          -- менеджер клієнта
  region_code   text,                          -- регіон менеджера
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (period, client_id, segment_code)
);

COMMENT ON TABLE focus_participants IS
  'Учасники фокусу на місяць (снапшот getClientFocus, per період×клієнт×сегмент). Крон sync-focus. Тижневий звіт читає замість live 1С.';

-- Зведення по регіону за період (Тижневий звіт).
CREATE INDEX IF NOT EXISTS idx_focus_period_region
  ON focus_participants (period, region_code);

-- RLS deny-all — читає/пише лише сервер (service_role).
ALTER TABLE focus_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY focus_deny_all ON focus_participants
  FOR ALL USING (false) WITH CHECK (false);
