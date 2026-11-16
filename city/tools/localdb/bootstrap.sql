-- make a bare Postgres look like a Supabase project, as far as the game's SQL can tell
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit login password 'localtest'; end if;
end $$;
grant anon, authenticated to authenticator;
create schema if not exists extensions;
grant usage on schema public, extensions to anon, authenticated;
-- Supabase's defaults: everything created in public is handed to anon and authenticated; row level security is the lock
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
