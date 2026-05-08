-- Migration M4: ВИПРАВЛЕННЯ — додати UNIQUE constraint на gap_closures
-- Date: 2026-05-08
-- Risk: LOW якщо дублів нема; MEDIUM якщо треба чистити дублі.
--
-- Why: Save planning через UPSERT з `onConflict: 'period_id,user_id,segment_code,client_id_1c'`
-- падає з 42P10 «there is no unique or exclusion constraint matching the ON CONFLICT
-- specification». Memory-doc заявляв що UNIQUE існує — насправді його у БД ніколи не було.
-- Виявлено через QA-тест на проді 2026-05-08.
--
-- ВИЯВЛЕНО ЯК: prod save fails →
--   "Upsert gap_closures (batch 17): HTTP 400 |
--    there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- ПОРЯДОК ЗАСТОСУВАННЯ:
--   1. Виконати ПРЕ-ЧЕК (запит 1 нижче) щоб побачити чи є дублі
--   2. Якщо дублів НЕМА (rows = 0) — застосувати запит 2 (CREATE UNIQUE INDEX)
--   3. Якщо дублі Є — спочатку видалити дублі (запит 3 — лишити найновіший по id),
--      потім запит 2
--
-- Після цього save почне працювати без 42P10.

-- ─── 1. ПРЕ-ЧЕК: чи є дублі ───
-- (Запустити окремо у SQL Editor; якщо empty — переходити до 2)
SELECT period_id, user_id, segment_code, client_id_1c, COUNT(*) AS dup_count
FROM gap_closures
GROUP BY period_id, user_id, segment_code, client_id_1c
HAVING COUNT(*) > 1
ORDER BY dup_count DESC;

-- ─── 2. CREATE UNIQUE INDEX ───
-- Запустити коли дублів нема. CONCURRENTLY НЕ використовуємо бо у транзакції
-- можна не concurrent (а Supabase SQL Editor виконує в транзакції).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_gap_closures_period_user_segment_client
  ON gap_closures (period_id, user_id, segment_code, client_id_1c);

-- ─── 3. (УМОВНО) DELETE DUPLICATES ───
-- Тільки якщо запит 1 повернув рядки. Лишаємо найновіший id.
-- РОЗКОМЕНТУЙ якщо потрібно:
--
-- DELETE FROM gap_closures gc1
-- WHERE EXISTS (
--   SELECT 1 FROM gap_closures gc2
--   WHERE gc2.period_id = gc1.period_id
--     AND gc2.user_id = gc1.user_id
--     AND gc2.segment_code = gc1.segment_code
--     AND gc2.client_id_1c = gc1.client_id_1c
--     AND gc2.id > gc1.id
-- );

-- ─── 4. ВЕРИФІКАЦІЯ ───
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'gap_closures'
  AND indexname = 'uniq_gap_closures_period_user_segment_client';
-- Очікую 1 рядок.

-- ─── 5. ТАК САМО ПЕРЕВІРИТИ FORECASTS ───
-- На всяк випадок — чи existing UNIQUE у forecasts ОК?
-- (Має існувати з самого початку. Підтвердити що memory не бреше.)
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'forecasts'::regclass
  AND contype = 'u';
-- Очікую: forecasts_period_id_user_id_segment_code_client_id_1c_key
