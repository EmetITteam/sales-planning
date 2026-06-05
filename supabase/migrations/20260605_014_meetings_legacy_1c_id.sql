-- Migration 014: legacy_1c_id для зустрічей з 1С
--
-- 1С — джерело істини. Наша БД — кеш. Зустрічі що існують у 1С (legacy з
-- Митингу або нові від інших каналів) імпортуються у нашу БД через
-- bulk-upsert при кожному getInitialData з UI.
--
-- legacy_1c_id зберігає оригінальний 1С-ID зустрічі. Наш id (UUID) лишається
-- primary key для consistency у API URLs і фронт-ланцюгу. Mapping робиться
-- через UNIQUE constraint щоб запобігти дублям при повторних bulk-import.
--
-- При sync назад у 1С (saveNewMeeting/updateMeeting):
--  - Якщо legacy_1c_id NULL → шлемо наш UUID як ID (нова meeting, 1С створить)
--  - Якщо legacy_1c_id заповнений → шлемо legacy_1c_id як ID (existing у 1С)

alter table meetings
  add column if not exists legacy_1c_id text;

-- UNIQUE щоб bulk-import був idempotent: ON CONFLICT (legacy_1c_id) DO NOTHING.
-- Partial index (WHERE NOT NULL) дозволяє безліч meeting з legacy_1c_id=NULL
-- (нові зустрічі створені у sales-planning ще до того як cron надіслав їх).
create unique index if not exists meetings_legacy_1c_id_unique
  on meetings (legacy_1c_id)
  where legacy_1c_id is not null;

comment on column meetings.legacy_1c_id is
  '1С-ID зустрічі (формат "0000001271320260604" і подібний). NULL для нових
   зустрічей які створені у sales-planning і ще не sync-нуті у 1С. Після
   sync — заповнюється з 1С response, щоб подальші bulk-import з 1С
   не створили дублікат.';
