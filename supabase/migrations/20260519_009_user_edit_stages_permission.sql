-- Migration M9: дозвіл редагувати етапи після фіналізації — per-manager
-- Date: 2026-05-19
-- Risk: LOW — лише додаємо колонку з default false. Без даних-міграцій, без FK, без index перебудов.
--
-- Why: РМ хоче надавати окремим менеджерам можливість змінювати поле `stage`
-- (Дзвінок/Зустріч/Навчання/Мессенджер) у формі планування ПІСЛЯ фіналізації.
-- Зараз після фіналу stage заблокований (тільки stage_comment і stage_done
-- редагуються). Деякі менеджери планують stage наперед на місяць, але потім
-- треба змінити (наприклад, клієнт замість дзвінка попросив зустріч) — щоб
-- не розфіналізовувати ВЕСЬ план заради цього, додаємо точковий дозвіл.
--
-- Адмін у /admin/stage-edit-permissions поставить галочку → менеджер бачить
-- розблокований stage select у формі. На бекенді /api/planning/route.ts при
-- isFinalized + non-admin ще й приймає `stage` коли цей флаг true.
--
-- ROLLBACK:
--   ALTER TABLE users DROP COLUMN can_edit_stages_after_finalize;

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_edit_stages_after_finalize boolean NOT NULL DEFAULT false;

-- Verification — мають бути 0 (тільки нова колонка, всі false)
DO $$
DECLARE
  cnt_true integer;
  cnt_total integer;
BEGIN
  SELECT count(*) INTO cnt_true FROM users WHERE can_edit_stages_after_finalize = true;
  SELECT count(*) INTO cnt_total FROM users;
  RAISE NOTICE 'Verification: % users total, % with permission ON (should be 0 — default false)', cnt_total, cnt_true;
  IF cnt_true <> 0 THEN
    RAISE EXCEPTION 'Unexpected: some users already have permission=true. Roll back and investigate.';
  END IF;
END $$;

COMMIT;

-- Як адмін потім видає дозвіл:
--   UPDATE users SET can_edit_stages_after_finalize = true WHERE login = 'sm.kiev3@emet.in.ua';
-- Через UI: /admin/stage-edit-permissions (буде у наступному комміті).
