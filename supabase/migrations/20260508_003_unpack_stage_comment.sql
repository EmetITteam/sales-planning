-- Migration M3: Unpack JSON у stage_comment / action на реальні колонки
-- Date: 2026-05-08
-- Risk: MEDIUM — змінюємо схему + мігруємо існуючі рядки.
--
-- Why: Зараз поля trainingId/trainingName/trainingDate і stageDone пакуються
-- у JSON-рядок і кладуться у legacy text-колонки `stage_comment` (forecasts)
-- і `action` (gap_closures). Це обхід через відсутність ALTER TABLE раніше.
-- Тепер додаємо нормальні колонки + мігруємо JSON у них.
--
-- Apply ORDER:
--   1. ВИКОНАТИ ЦЮ МІГРАЦІЮ у Supabase
--   2. Деплой коду який пише і читає НОВІ колонки + старий JSON одночасно
--      (transitional period)
--   3. Перевірити що нові коліки заповнюються коректно
--   4. Через 1-2 тижні — окрема міграція яка видаляє JSON pack
--
-- Apply (Supabase dashboard SQL editor):

-- ─── forecasts ───
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS training_id text;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS training_name text;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS training_date date;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS stage_done boolean DEFAULT false NOT NULL;

-- Migrate existing JSON-packed data: парсимо stage_comment, дістаємо поля.
-- v3 формат: {"v":3, "comment": "...", "stageDone": true, "trainingId": "...", ...}
UPDATE forecasts SET
  training_id = NULLIF(COALESCE((stage_comment::jsonb)->>'trainingId', ''), ''),
  training_name = NULLIF(COALESCE((stage_comment::jsonb)->>'trainingName', ''), ''),
  training_date = NULLIF(COALESCE((stage_comment::jsonb)->>'trainingDate', ''), '')::date,
  stage_done = COALESCE(((stage_comment::jsonb)->>'stageDone')::boolean, false)
WHERE stage_comment IS NOT NULL
  AND stage_comment ~ '^{.*}$'  -- guard: тільки якщо це JSON
  AND ((stage_comment::jsonb)->>'v' IN ('2', '3'));

-- Тепер очистити stage_comment до plain text (тільки comment без JSON-обгортки):
UPDATE forecasts SET
  stage_comment = NULLIF((stage_comment::jsonb)->>'comment', '')
WHERE stage_comment IS NOT NULL
  AND stage_comment ~ '^{.*}$'
  AND ((stage_comment::jsonb)->>'v' IN ('2', '3'));

-- ─── gap_closures ───
ALTER TABLE gap_closures ADD COLUMN IF NOT EXISTS stage text;
ALTER TABLE gap_closures ADD COLUMN IF NOT EXISTS training_id text;
ALTER TABLE gap_closures ADD COLUMN IF NOT EXISTS training_name text;
ALTER TABLE gap_closures ADD COLUMN IF NOT EXISTS training_date date;
ALTER TABLE gap_closures ADD COLUMN IF NOT EXISTS stage_done boolean DEFAULT false NOT NULL;
ALTER TABLE gap_closures ADD COLUMN IF NOT EXISTS closure_completed boolean DEFAULT false NOT NULL;
ALTER TABLE gap_closures ADD COLUMN IF NOT EXISTS stage_comment text;

-- Migrate gap_closures: пакування у `action` колонку.
-- v2 формат: {"v":2, "stage": "...", "stageComment": "...", "stageDone": true,
--           "completed": false, "trainingId": "...", "trainingName": "...", "trainingDate": "..."}
UPDATE gap_closures SET
  stage = NULLIF(COALESCE((action::jsonb)->>'stage', ''), ''),
  stage_comment = NULLIF(COALESCE((action::jsonb)->>'stageComment', ''), ''),
  stage_done = COALESCE(((action::jsonb)->>'stageDone')::boolean, false),
  closure_completed = COALESCE(((action::jsonb)->>'completed')::boolean, false),
  training_id = NULLIF(COALESCE((action::jsonb)->>'trainingId', ''), ''),
  training_name = NULLIF(COALESCE((action::jsonb)->>'trainingName', ''), ''),
  training_date = NULLIF(COALESCE((action::jsonb)->>'trainingDate', ''), '')::date
WHERE action IS NOT NULL
  AND action ~ '^{.*}$'
  AND (action::jsonb)->>'v' = '2';

-- Verify:
-- SELECT id, training_id, training_name, training_date, stage_done FROM forecasts WHERE training_id IS NOT NULL LIMIT 5;
-- SELECT id, stage, stage_done, closure_completed FROM gap_closures WHERE stage IS NOT NULL LIMIT 5;

-- TODO (окрема міграція через 1-2 тижні після деплою нового коду):
--   ALTER TABLE forecasts DROP COLUMN stage_comment;  -- після перевірки що нові колонки повні
--   ALTER TABLE gap_closures DROP COLUMN action;
