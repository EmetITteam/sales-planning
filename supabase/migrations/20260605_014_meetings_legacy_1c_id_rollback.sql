drop index if exists meetings_legacy_1c_id_unique;
alter table meetings drop column if exists legacy_1c_id;
