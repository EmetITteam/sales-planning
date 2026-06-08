alter table meetings
  drop column if exists client_name,
  drop column if exists client_phone,
  drop column if exists client_category;
