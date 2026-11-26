alter table sessions add column theme_id bigint references themes(id) on delete set null;
-- Keep the name after regeneration so retired theme conversations remain identifiable.
alter table sessions add column theme_name text;
alter table sessions add constraint sessions_theme_scope_valid check (
  (theme_id is null and theme_name is null) or
  (theme_name is not null and length(btrim(theme_name)) > 0 and
    (theme_id is not null or ended_at is not null))
);
drop index sessions_one_active_idx;
create unique index sessions_one_active_idx on sessions (sector_ids)
  where ended_at is null and theme_name is null;
create unique index sessions_one_active_theme_idx on sessions (theme_id)
  where ended_at is null and theme_id is not null;
