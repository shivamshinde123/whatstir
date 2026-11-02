-- At most one refresh run may be 'running'. This is the refresh lock: unlike an
-- advisory lock it works through Supabase's transaction pooler and doesn't need a
-- transaction held open for the whole run. See docs/decision.md #33.
create unique index refresh_runs_one_running_idx on refresh_runs ((status)) where status = 'running';
