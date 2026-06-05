-- Migration 016: Replace partial UNIQUE on legacy_1c_id with full UNIQUE
--
-- Migration 014 створив partial index (WHERE legacy_1c_id IS NOT NULL).
-- PostgREST для ON CONFLICT не приймає partial constraint → bulk-import
-- падав з «no unique or exclusion constraint matching ON CONFLICT specification».
--
-- Postgres дозволяє множинні NULL у звичайному UNIQUE constraint (NULL ≠ NULL),
-- тому partial WHERE був зайвий. Прибираємо.

drop index if exists meetings_legacy_1c_id_unique;

create unique index if not exists meetings_legacy_1c_id_unique
  on meetings (legacy_1c_id);
