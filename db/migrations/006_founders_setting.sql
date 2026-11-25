-- Founder fetching can be switched on from Admin (issue #67), and a founders-only pass uses the
-- refresh slot under its own trigger so it never overlaps a refresh.
insert into app_settings (key, value) values ('founders_fetch', 'false') on conflict (key) do nothing;

alter table refresh_runs drop constraint refresh_runs_trigger_check;
alter table refresh_runs add constraint refresh_runs_trigger_check
  check (trigger in ('cron', 'manual', 'script', 'founders'));
