-- Rollback for 022_client_comments
DROP INDEX IF EXISTS idx_client_comments_client_count;
DROP INDEX IF EXISTS idx_client_comments_client_active;
DROP TABLE IF EXISTS client_comments;
