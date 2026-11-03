-- Supabase serves every table in the public schema over its REST "Data API" to anyone holding
-- the project's public anon key. Whatstir never uses that API (the server connects to Postgres
-- directly as the tables' owner), so close it: enable row-level security with no policies, and
-- take the API roles' privileges away. The owner bypasses RLS, so the app is unaffected.
-- Plain Postgres (local, tests, CI) has no anon/authenticated roles; that part is skipped there.
do $$
declare
  t record;
  r text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = current_schema() and c.relkind = 'r'
  loop
    execute format('alter table %I.%I enable row level security', current_schema(), t.relname);
  end loop;

  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema %I from %I', current_schema(), r);
      execute format('revoke all on all sequences in schema %I from %I', current_schema(), r);
      execute format('revoke all on all functions in schema %I from %I', current_schema(), r);
      execute format('alter default privileges in schema %I revoke all on tables from %I', current_schema(), r);
      execute format('alter default privileges in schema %I revoke all on sequences from %I', current_schema(), r);
      execute format('alter default privileges in schema %I revoke all on functions from %I', current_schema(), r);
    end if;
  end loop;
end $$;
