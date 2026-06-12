-- 024: Верифікація нових клієнтів через Bitrix SPA 1048.
--
-- Менеджер реєструє нового клієнта у 1С через `registerNewClient`.
-- Клієнт потрапляє у «Резерв» у 1С. Наш бекенд паралельно створює
-- картку у Bitrix SPA 1048 — це робоча черга для КЦ-менеджерів.
-- КЦ обробляє у Bitrix, закриває картку → webhook → колокольчик у
-- менеджера.
--
-- Ця таблиця — local-cache стану верифікації. Single source of truth —
-- Bitrix. Тут зберігаємо тільки те що потрібно для UI бейджа / фільтра
-- «На верифікації» без runtime-запитів у Bitrix.

CREATE TABLE IF NOT EXISTS client_verifications (
  id BIGSERIAL PRIMARY KEY,
  -- ClientID з 1С (registerNewClient повертає) — наш «foreign key»
  -- у простір 1С-сутностей. UI це використовує щоб знайти картку.
  client_id_1c TEXT NOT NULL,
  -- ID Bitrix SPA item (відомий після crm.item.add). Може бути null
  -- якщо Bitrix create впав — таку картку треба ретраїти або алертити.
  bitrix_item_id BIGINT,
  -- Лог менеджера-ініціатора (потрібен для адресації нотифікації).
  manager_login TEXT NOT NULL,
  -- Snapshot ПІБ для UI «Клієнт {name} верифіковано» у нотифікації.
  client_name TEXT NOT NULL,
  -- Поточний стан з Bitrix воронки.
  --   'pending'       — створено у Bitrix, чекає КЦ
  --   'in_progress'   — КЦ взяв у роботу
  --   'clarification' — КЦ запитав уточнення у менеджера
  --   'verified'      — успіх (DONE у Bitrix)
  --   'rejected'      — відхилено
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'clarification', 'verified', 'rejected')),
  -- Причина відхилення (заповнюється webhook при status='rejected').
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Час фінального статусу (verified/rejected) — для метрик «середній час обробки».
  completed_at TIMESTAMPTZ,
  -- Оновлюється на кожен status change.
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot read: список pending верифікацій менеджера для UI бейджа / фільтра.
CREATE INDEX IF NOT EXISTS idx_client_verifications_manager_status
  ON client_verifications (manager_login, status)
  WHERE status IN ('pending', 'in_progress', 'clarification');

-- Lookup за clientId (UI бейдж на картці клієнта).
CREATE INDEX IF NOT EXISTS idx_client_verifications_client
  ON client_verifications (client_id_1c, created_at DESC);

-- Lookup за Bitrix item id (webhook handler шукає за цим коли приходить status change).
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_verifications_bitrix_uniq
  ON client_verifications (bitrix_item_id)
  WHERE bitrix_item_id IS NOT NULL;

-- RLS — pattern як у решти core-таблиць (service_role bypass).
ALTER TABLE client_verifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'client_verifications' AND policyname = 'svc_full_access'
  ) THEN
    CREATE POLICY svc_full_access ON client_verifications
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE client_verifications IS
  '🔍 Верифікація нових клієнтів КЦ через Bitrix SPA 1048. Local-cache, source of truth у Bitrix.';
