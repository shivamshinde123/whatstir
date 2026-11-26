create table themes (
  id bigint generated always as identity primary key,
  name text not null check (length(btrim(name)) > 0),
  description text not null,
  model text not null,
  generated_at timestamptz not null default now()
);

create table company_themes (
  company_id int primary key references companies (id) on delete cascade,
  theme_id bigint not null references themes (id) on delete cascade
);
create index company_themes_theme_idx on company_themes (theme_id);
alter table themes enable row level security;
alter table company_themes enable row level security;
revoke all on themes, company_themes from public;

alter table refresh_runs drop constraint refresh_runs_trigger_check;
alter table refresh_runs add constraint refresh_runs_trigger_check
  check (trigger in ('cron', 'manual', 'script', 'founders', 'themes'));

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on themes, company_themes from %I', r);
      execute format('revoke all on sequence themes_id_seq from %I', r);
    end if;
  end loop;
end $$;
