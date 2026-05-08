-- Migration M5: users.id integer → text PK (login as PK)
-- Date: 2026-05-08
-- Risk: MEDIUM — переписуємо PK + усі FK + перебудовуємо UNIQUE/index.
--
-- Why: Зараз users.id це int hash(login) через loginToUserId(). Це працювало
-- але:
--   1. Логи незрозумілі: user_id=1740636948 ←→ хто це?
--   2. Хеш-колізії теоретично можливі (зараз 5 юзерів — нема, але).
--   3. Multi-session робота простіша коли є природний PK.
-- Після міграції users.id == users.login (одне значення).
--
-- ПЕРЕД ЗАПУСКОМ:
--   1. Backup (вже зроблено: `backups/2026-05-08/` + `backup_20260508_*` таблиці у БД)
--   2. Vercel auto-deploy має бути НЕ запущений (інакше старий код спробує писати int)
--      — деплой нового коду зробимо ПІСЛЯ цієї міграції.
--
-- ПОРЯДОК:
--   1. Запустити цей SQL у Dashboard SQL Editor (одна транзакція)
--   2. Переконатись що верифікація (нижче) ОК
--   3. Я (Claude) тоді деплою нову версію коду без loginToUserId
--
-- ROLLBACK:
--   Якщо щось пішло не так — у нас є backup_20260508_* таблиці, можна
--   повернути через DROP+rename. Або через DROP TABLE + CREATE TABLE AS
--   SELECT * FROM backup_*.

BEGIN;

-- ─── 1. Drop FK constraints (щоб дозволити ALTER COLUMN) ───
ALTER TABLE forecasts DROP CONSTRAINT IF EXISTS forecasts_user_id_fkey;
ALTER TABLE gap_closures DROP CONSTRAINT IF EXISTS gap_closures_user_id_fkey;
ALTER TABLE period_summaries DROP CONSTRAINT IF EXISTS period_summaries_user_id_fkey;
ALTER TABLE periods DROP CONSTRAINT IF EXISTS periods_created_by_fkey;

-- ─── 2. Drop UNIQUE constraints що включають user_id (вони перестворяться) ───
-- forecasts: UNIQUE(period_id, user_id, segment_code, client_id_1c)
ALTER TABLE forecasts DROP CONSTRAINT IF EXISTS forecasts_period_id_user_id_segment_code_client_id_1c_key;
-- gap_closures: M4 hotfix index уже має той самий ключ — drop і відтворити після
DROP INDEX IF EXISTS uniq_gap_closures_period_user_segment_client;
-- period_summaries: композитний UNIQUE на (period_id, user_id, segment_code)
ALTER TABLE period_summaries DROP CONSTRAINT IF EXISTS period_summaries_period_id_user_id_segment_code_key;

-- ─── 3. Drop indexes що включають user_id (перестворимо після) ───
DROP INDEX IF EXISTS idx_forecasts_period_user_segment;
DROP INDEX IF EXISTS idx_forecasts_user;
DROP INDEX IF EXISTS idx_forecasts_period_user;
DROP INDEX IF EXISTS idx_gap_closures_period_user_segment;
DROP INDEX IF EXISTS idx_gap_closures_user;
DROP INDEX IF EXISTS idx_period_summaries_period_user_segment;

-- ─── 4. Backfill: int user_id → text login через JOIN з users ───
-- Спочатку додаємо тимчасові колонки text, наповнюємо, потім свапаємо.
ALTER TABLE forecasts ADD COLUMN _new_user_id text;
ALTER TABLE gap_closures ADD COLUMN _new_user_id text;
ALTER TABLE period_summaries ADD COLUMN _new_user_id text;
ALTER TABLE periods ADD COLUMN _new_created_by text;

UPDATE forecasts f SET _new_user_id = u.login
  FROM users u WHERE u.id = f.user_id;
UPDATE gap_closures g SET _new_user_id = u.login
  FROM users u WHERE u.id = g.user_id;
UPDATE period_summaries ps SET _new_user_id = u.login
  FROM users u WHERE u.id = ps.user_id;
UPDATE periods p SET _new_created_by = u.login
  FROM users u WHERE u.id = p.created_by;

-- Sanity: жоден рядок не має NULL у _new_user_id (інакше FK поламається)
-- Якщо є — означає був orphan FK на неіснуючого юзера; виправити вручну.
DO $$
DECLARE n integer;
BEGIN
  SELECT COUNT(*) INTO n FROM forecasts WHERE _new_user_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'forecasts has % orphan user_id refs', n; END IF;
  SELECT COUNT(*) INTO n FROM gap_closures WHERE _new_user_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'gap_closures has % orphan user_id refs', n; END IF;
  SELECT COUNT(*) INTO n FROM period_summaries WHERE _new_user_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'period_summaries has % orphan user_id refs', n; END IF;
  -- periods.created_by — nullable, NULL це OK (записи без автора)
END $$;

-- ─── 5. Конвертуємо users.id INT → TEXT (=login) ───
-- Перш ніж змінювати тип PK — drop PK constraint, потім alter, потім add back.
ALTER TABLE users DROP CONSTRAINT users_pkey;
ALTER TABLE users ALTER COLUMN id TYPE text USING login;
ALTER TABLE users ADD PRIMARY KEY (id);

-- ─── 6. Свап колонок: drop old INT, rename _new ───
ALTER TABLE forecasts DROP COLUMN user_id;
ALTER TABLE forecasts RENAME COLUMN _new_user_id TO user_id;
ALTER TABLE forecasts ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE gap_closures DROP COLUMN user_id;
ALTER TABLE gap_closures RENAME COLUMN _new_user_id TO user_id;
ALTER TABLE gap_closures ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE period_summaries DROP COLUMN user_id;
ALTER TABLE period_summaries RENAME COLUMN _new_user_id TO user_id;
ALTER TABLE period_summaries ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE periods DROP COLUMN created_by;
ALTER TABLE periods RENAME COLUMN _new_created_by TO created_by;
-- periods.created_by лишаємо nullable (історично було).

-- ─── 7. Recreate FK constraints (тепер на text) ───
ALTER TABLE forecasts ADD CONSTRAINT forecasts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE gap_closures ADD CONSTRAINT gap_closures_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE period_summaries ADD CONSTRAINT period_summaries_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE periods ADD CONSTRAINT periods_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id);

-- ─── 8. Recreate UNIQUE constraints ───
ALTER TABLE forecasts ADD CONSTRAINT forecasts_period_id_user_id_segment_code_client_id_1c_key
  UNIQUE (period_id, user_id, segment_code, client_id_1c);
CREATE UNIQUE INDEX uniq_gap_closures_period_user_segment_client
  ON gap_closures (period_id, user_id, segment_code, client_id_1c);
ALTER TABLE period_summaries ADD CONSTRAINT period_summaries_period_id_user_id_segment_code_key
  UNIQUE (period_id, user_id, segment_code);

-- ─── 9. Recreate composite indexes (M1) ───
CREATE INDEX idx_forecasts_period_user_segment ON forecasts (period_id, user_id, segment_code);
CREATE INDEX idx_forecasts_user ON forecasts (user_id);
CREATE INDEX idx_gap_closures_period_user_segment ON gap_closures (period_id, user_id, segment_code);
CREATE INDEX idx_gap_closures_user ON gap_closures (user_id);
CREATE INDEX idx_period_summaries_period_user_segment ON period_summaries (period_id, user_id, segment_code);

COMMIT;

-- ═══ ВЕРИФІКАЦІЯ (запускати окремими query після COMMIT) ═══

-- 1. Row counts мають збігатися з backup (5 / 6 / 29 / 22 / 2)
-- SELECT
--   (SELECT COUNT(*) FROM users)             AS users,
--   (SELECT COUNT(*) FROM periods)           AS periods,
--   (SELECT COUNT(*) FROM forecasts)         AS forecasts,
--   (SELECT COUNT(*) FROM gap_closures)      AS gap_closures,
--   (SELECT COUNT(*) FROM period_summaries)  AS period_summaries;

-- 2. user_id у forecasts/gap_closures/period_summaries тепер text-логіни
-- SELECT id, user_id, segment_code, client_id_1c FROM forecasts LIMIT 3;
-- Очікую users.login значення в user_id (наприклад 'sm.dnepr3@emet.in.ua')

-- 3. users.id == users.login
-- SELECT id, login, full_name FROM users LIMIT 5;
-- Очікую що id і login це ті самі рядки

-- 4. Constraints створені:
-- SELECT conname, contype FROM pg_constraint
-- WHERE conrelid IN ('users'::regclass,'forecasts'::regclass,'gap_closures'::regclass,'period_summaries'::regclass,'periods'::regclass)
-- ORDER BY conrelid::text, contype;
