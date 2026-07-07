-- ============================================================================
-- Migration 050: реакція менеджера «Виконано» на коментар директора
-- Created 2026-07-07
-- ============================================================================
--
-- Менеджер, отримавши коментар директора, позначає його «Виконано» — коментар
-- зникає з треда, а директору прилітає сповіщення (тип plan_comment_resolved).
-- Додаємо resolved_at / resolved_by. Активний тред = resolved_at IS NULL.
-- ============================================================================

ALTER TABLE plan_comments ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE plan_comments ADD COLUMN IF NOT EXISTS resolved_by TEXT;

-- Частковий індекс — швидка вибірка активних (невиконаних) коментарів треда.
CREATE INDEX IF NOT EXISTS idx_plan_comments_active
  ON plan_comments (manager_login, period_id, segment_code)
  WHERE resolved_at IS NULL;
