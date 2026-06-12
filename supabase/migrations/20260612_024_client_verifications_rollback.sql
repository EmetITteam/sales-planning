-- Rollback for 024_client_verifications
DROP INDEX IF EXISTS idx_client_verifications_bitrix_uniq;
DROP INDEX IF EXISTS idx_client_verifications_client;
DROP INDEX IF EXISTS idx_client_verifications_manager_status;
DROP TABLE IF EXISTS client_verifications;
