-- ============================================================================
-- Migration 053: temporary_region_access — тимчасовий доступ менеджера до
-- перегляду всього регіону (для планёрок)
-- Created 2026-07-14
-- ============================================================================
--
-- КОНТЕКСТ: у Києві нема закріпленого РМ. Щотижня на планёрці виступає інший
-- менеджер — йому на цей час потрібно бачити ВЕСЬ регіон (план/факт усіх
-- менеджерів) щоб відзвітувати. Директор продажів / асистент видають цей
-- тимчасовий доступ: регіон + менеджер + період.
--
-- Доступ = read-only перегляд блоку «Планування» регіону (RM-вид). Механізм
-- даних — динамічна версія MULTI_REGION_RM_OVERRIDES (Action 5 через
-- директор-прокси + фільтр по region_code).
--
-- Активний грант: revoked_at IS NULL AND CURRENT_DATE BETWEEN valid_from AND valid_to.
-- ============================================================================

CREATE TABLE IF NOT EXISTS temporary_region_access (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_login text        NOT NULL,          -- кому видано (логін менеджера)
  region_code   text        NOT NULL,          -- який регіон (divisionCode з 1С)
  region_name   text,                          -- назва регіону (denorm, для списку)
  manager_name  text,                          -- ПІБ менеджера (denorm, для списку)
  valid_from    date        NOT NULL,          -- початок доступу (включно)
  valid_to      date        NOT NULL,          -- кінець доступу (включно)
  granted_by    text        NOT NULL,          -- хто видав (sdu / assistant / admin)
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,                   -- дострокове відкликання (NULL = діє)
  CONSTRAINT chk_tra_dates CHECK (valid_to >= valid_from)
);

COMMENT ON TABLE temporary_region_access IS
  'Тимчасовий доступ менеджера до перегляду всього регіону (планёрки). Активний = revoked_at IS NULL AND CURRENT_DATE у [valid_from; valid_to]. Read-only, блок Планування.';

-- Швидкий lookup активних грантів менеджера (для /api/auth/me + роутів).
CREATE INDEX IF NOT EXISTS idx_tra_manager_active
  ON temporary_region_access (manager_login)
  WHERE revoked_at IS NULL;

-- RLS deny-all — як sales/rollup. Читає лише сервер (service_role обходить RLS).
ALTER TABLE temporary_region_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY tra_deny_all ON temporary_region_access
  FOR ALL USING (false) WITH CHECK (false);
