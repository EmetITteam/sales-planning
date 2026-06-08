drop index if exists meetings_legacy_1c_id_unique;

create unique index if not exists meetings_legacy_1c_id_unique
  on meetings (legacy_1c_id)
  where legacy_1c_id is not null;
