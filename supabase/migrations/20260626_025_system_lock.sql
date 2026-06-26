-- ============================================================================
-- Migration 025: System lock kill-switch
-- Created 2026-06-26
-- ============================================================================
--
-- Призначення: один прапорець у БД щоб admin міг швидко заблокувати ВСЮ систему
-- у форс-мажорі (витік даних, атака, etc.). При locked=true тільки admin може:
--   1) залогінитись
--   2) робити будь-які API запити (/api/onec, /api/planning, ...)
--   3) керувати самим kill-switch
--
-- Всі інші користувачі при locked=true:
--   - login повертає 503 SYSTEM_LOCKED
--   - наявні сесії падають з 503 на наступному API call → редирект на /system-locked
--
-- Як вимкнути блокування: admin іде на /admin/system-lock і натискає toggle.
--
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text NOT NULL DEFAULT 'init'
);

COMMENT ON TABLE system_settings IS
  'Загальносистемні налаштування (key-value, JSONB). Зараз містить тільки system_locked.';

-- Seed: розблоковано за замовч.
INSERT INTO system_settings (key, value, updated_by) VALUES
  ('system_locked', '{"locked": false, "reason": null, "locked_at": null, "locked_by": null}', 'migration_025')
ON CONFLICT (key) DO NOTHING;

-- RLS — тільки admin (через бекенд, ми тут не використовуємо JWT-claims).
-- Бекенд читає таблицю через service_role (omit RLS), тому policy денує всім.
-- Це best practice: чутливий kill-switch не доступний через прямий клієнтський
-- query, тільки через серверну логіку.
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_settings_deny_all ON system_settings
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON POLICY system_settings_deny_all ON system_settings IS
  'Deny all direct access. Read/write only через service_role з бекенду.';
