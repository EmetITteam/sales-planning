-- ============================================================================
-- Migration 049: коментарі директора по продажах до плану менеджера
-- Created 2026-07-06
-- ============================================================================
--
-- Директор по продажах у режимі «Перегляд менеджера» лишає коментар до плану
-- конкретного БРЕНДА (сегмента) менеджера — замість листів «кому що переробити».
-- Опційно одночасно розфіналізує цей бренд (щоб менеджер міг переробити).
-- Коментар прилітає менеджеру у колокольчик (notifications, тип
-- plan_director_comment) + показується на бренді у плані (тред).
--
-- Гранулярність: (manager × period × segment) — паритет з period_summaries.
-- action: 'comment' — лише коментар; 'comment_unfinalize' — коментар + розфін.
-- ============================================================================

CREATE TABLE IF NOT EXISTS plan_comments (
  id            BIGSERIAL PRIMARY KEY,
  manager_login TEXT NOT NULL,        -- отримувач (чий план)
  period_id     INT  NOT NULL,        -- monthly canonical pid (як у period_summaries)
  segment_code  TEXT NOT NULL,        -- бренд/сегмент
  author_login  TEXT NOT NULL,        -- директор (автор)
  author_name   TEXT,                 -- ПІБ автора для показу
  text          TEXT NOT NULL,
  action        TEXT NOT NULL DEFAULT 'comment' CHECK (action IN ('comment', 'comment_unfinalize')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Швидкий доступ до тредy бренда у плані + сортування за часом.
CREATE INDEX IF NOT EXISTS idx_plan_comments_lookup
  ON plan_comments (manager_login, period_id, segment_code, created_at);

-- RLS: доступ лише через service role (наш /api використовує SUPABASE_SERVICE_ROLE_KEY,
-- який обходить RLS). Anon/authenticated ключі — заборонено.
ALTER TABLE plan_comments ENABLE ROW LEVEL SECURITY;
