-- M10 — Window-lock + per-user lock overrides
--
-- planning_settings:
--   Single-row table з глобальними налаштуваннями вікна планування.
--   window_days = скільки перших днів місяця менеджери можуть планувати.
--   За замовч. 5 — тобто з 1-го по 5-те менеджери можуть редагувати поточний
--   місяць, далі — заблоковано (для всіх крім admin).
--
-- planning_locks:
--   Per-user overrides + явні глобальні блокування на конкретний місяць.
--   scope='global', user_login=NULL → діє на всіх менеджерів цього місяця.
--   scope='user', user_login=<login> → персональний lock/allow.
--   type='block' → заборонити (навіть якщо window day < window_days).
--   type='allow' → дозволити (навіть якщо window вже закритий).
--   Найбільш специфічна правила перемагає: user > global, block > allow при конфлікті.

CREATE TABLE IF NOT EXISTS planning_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  window_days INT NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

INSERT INTO planning_settings (id, window_days)
VALUES (1, 5)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS planning_locks (
  id SERIAL PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'user')),
  user_login TEXT NULL,
  month DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('block', 'allow')),
  reason TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Якщо scope=user → user_login NOT NULL. Якщо scope=global → user_login NULL.
  CONSTRAINT user_login_matches_scope CHECK (
    (scope = 'user' AND user_login IS NOT NULL) OR
    (scope = 'global' AND user_login IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_planning_locks_month
  ON planning_locks (month);
CREATE INDEX IF NOT EXISTS idx_planning_locks_user
  ON planning_locks (user_login)
  WHERE user_login IS NOT NULL;

COMMENT ON TABLE planning_settings IS 'Глобальні налаштування вікна планування (singleton row).';
COMMENT ON TABLE planning_locks IS 'Явні блокування / дозволи планування на (логін × місяць). Перевизначають window_days.';
COMMENT ON COLUMN planning_locks.scope IS 'global = всі менеджери на цей місяць; user = конкретний логін.';
COMMENT ON COLUMN planning_locks.type IS 'block = заборонити; allow = дозволити поза window.';
