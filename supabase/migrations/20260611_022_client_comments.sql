-- 022: Замітки менеджера по клієнтах (історія)
-- Менеджер / РМ / director / admin можуть лишати текстові замітки
-- по конкретному клієнту з 1С (ClientID). Замітки прив'язуються до
-- клієнта (а не до менеджера), щоб історія лишалась при передачі клієнта.
--
-- Soft-delete: видалити можна тільки СВОЮ замітку. У БД лишається
-- з `deleted_at IS NOT NULL`, у вибірці фільтруємо.
--
-- author_name — снапшот ФІО на момент створення. Якщо менеджер звільниться
-- і запис у users буде оновлено / видалено, ФІО у історії лишиться.

CREATE TABLE IF NOT EXISTS client_comments (
  id BIGSERIAL PRIMARY KEY,
  client_id_1c TEXT NOT NULL,
  author_login TEXT NOT NULL,
  author_name TEXT NOT NULL,
  comment TEXT NOT NULL CHECK (length(comment) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Hot read path: усі коментарі по клієнту, найновіший зверху,
-- виключаючи soft-deleted.
CREATE INDEX IF NOT EXISTS idx_client_comments_client_active
  ON client_comments (client_id_1c, created_at DESC)
  WHERE deleted_at IS NULL;

-- Для bulk-counts на сторінці «Мої клієнти».
CREATE INDEX IF NOT EXISTS idx_client_comments_client_count
  ON client_comments (client_id_1c)
  WHERE deleted_at IS NULL;

-- RLS вимкнено: service_role обходить, всі guards — у API-роутах
-- (узгоджено з рештою таблиць проекту до RLS-міграції з аудиту).
ALTER TABLE client_comments ENABLE ROW LEVEL SECURITY;
