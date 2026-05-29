-- Migration M10: дозвіл бачити «Огляд компанії» — per-user
-- Date: 2026-05-25
-- Risk: LOW — лише додаємо колонку з default false. Без даних-міграцій, без FK.
--
-- Why: Admin-сторінка «Огляд компанії» має показуватись не тільки admin-у,
-- а й окремим юзерам яким адмін надав дозвіл (наприклад Саша — директор
-- продажу). Реалізуємо через per-user toggle у /admin/company-overview-permissions.
--
-- Адмін у /admin/company-overview-permissions поставить галочку → юзер
-- бачить toggle «Дашборд / Огляд компанії» на головній сторінці.
-- Без галочки — toggle не показується, видно тільки свій звичайний дашборд.
--
-- ROLLBACK:
--   ALTER TABLE users DROP COLUMN can_view_company_overview;

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_view_company_overview boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  cnt_true integer;
  cnt_total integer;
BEGIN
  SELECT count(*) INTO cnt_true FROM users WHERE can_view_company_overview = true;
  SELECT count(*) INTO cnt_total FROM users;
  RAISE NOTICE 'Verification: % users total, % with permission ON (default false expected)', cnt_total, cnt_true;
END $$;

COMMIT;

-- Видати дозвіл вручну якщо потрібно:
--   UPDATE users SET can_view_company_overview = true WHERE login = 'sdu@emet.in.ua';
-- Або через UI: /admin/company-overview-permissions
