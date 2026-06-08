-- 020: Per-user дозвіл розфіналізовувати плани (без admin-доступу).
--
-- Поки що тільки admin може натискати «Розфіналізувати» у формі планування.
-- Цей флаг дає такий же дозвіл конкретним користувачам (наприклад, асистенту
-- директора з продажу) без видачі повного admin-доступу.
--
-- Логіка у фронті — `PlanningForm`: показує кнопку якщо `isAdmin || user.canUnfinalizePlans`.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_unfinalize_plans BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.can_unfinalize_plans IS
  'Дозвіл розфіналізовувати плани менеджерів без admin-ролі. Default false.';
