alter table meetings
  drop column if exists started_at,
  drop column if exists finished_at;
