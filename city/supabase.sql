-- BDB City: accounts and saved cities.
-- Run this once in the Supabase SQL editor, on the same project Break Room Brawl uses
-- (it is safe to run again; it changes nothing that Brawl owns).
--
-- Players sign in with a name and a password. The tables have row level security on and no
-- policies, so nothing can read or write them directly: the page can only call the functions below.
--
-- One login for the whole site, without touching Brawl's table: a Brawl player signs in to City
-- with the same name and password (the account is copied across the first time), and nobody else
-- can take a Brawl player's name here. City never writes to brawl_players, and works without it.

create extension if not exists pgcrypto with schema extensions;

-- Helpers live in a schema of their own. The page can only reach functions in `public`, and one of
-- these hands back a password hash, so it must never be reachable from outside.
create schema if not exists bdb_private;
revoke all on schema bdb_private from public, anon, authenticated;

create table if not exists public.city_players (
  name_key   text primary key,                       -- the name in lower case
  name       text not null,
  pass       text not null,                          -- bcrypt hash, never the password itself
  token      uuid not null default gen_random_uuid(),
  seen_at    timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.city_cities (
  id         uuid primary key,                       -- chosen by the game when the city is founded
  owner_key  text not null references public.city_players (name_key) on delete cascade,
  name       text not null,
  seed       integer not null,
  start      text,                                   -- village, town or empty: how it began
  population integer not null default 0,
  money      bigint  not null default 0,
  happiness  integer not null default 0,             -- 0 to 100
  day        integer not null default 0,             -- game days played
  data       text not null,                          -- the whole city, packed by the game; never read here
  rev        integer not null default 1,             -- goes up by one on every save
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists city_cities_owner on public.city_cities (owner_key, updated_at desc);
create index if not exists city_cities_top on public.city_cities (population desc);

alter table public.city_players enable row level security;
alter table public.city_cities enable row level security;

-- Is the server set up? The game asks this first and hides the account screen if there is no answer.
create or replace function public.city_ping()
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object('ok', true, 'v', 1, 'max_cities', 12, 'max_bytes', 1500000);
$$;

-- The bcrypt hash of a Brawl account, or null.
create or replace function bdb_private.city_brawl_pass(p_key text)
returns text language plpgsql stable security definer set search_path = public, extensions as $$
declare h text;
begin
  if to_regclass('public.brawl_players') is null then return null; end if;
  execute 'select pass from public.brawl_players where name_key = $1' into h using p_key;
  return h;
end $$;

-- The player's key if the name and token belong together, else null.
create or replace function bdb_private.city_who(p_name text, p_token uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare k text := lower(btrim(coalesce(p_name, '')));
begin
  update city_players set seen_at = now() where name_key = k and token = p_token;
  if not found then return null; end if;
  return k;
end $$;

create or replace function public.city_register(p_name text, p_pass text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := lower(btrim(coalesce(p_name, ''))); t uuid; bp text; h text;
begin
  if char_length(k) < 2 or char_length(k) > 20 or p_pass is null or char_length(p_pass) < 4 or char_length(p_pass) > 72 then
    return jsonb_build_object('error', 'bad_input');
  end if;
  -- a name that is a Brawl account belongs to that player: only their password can claim it here
  bp := bdb_private.city_brawl_pass(k);
  if bp is not null then
    if bp <> crypt(p_pass, bp) then return jsonb_build_object('error', 'taken'); end if;
    h := bp;
  else
    h := crypt(p_pass, gen_salt('bf', 8));
  end if;
  begin
    insert into city_players (name_key, name, pass) values (k, btrim(p_name), h) returning token into t;
  exception when unique_violation then return jsonb_build_object('error', 'taken');
  end;
  return jsonb_build_object('token', t, 'name', btrim(p_name));
end $$;

create or replace function public.city_login(p_name text, p_pass text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := lower(btrim(coalesce(p_name, ''))); r city_players; bp text;
begin
  if p_pass is null then return jsonb_build_object('error', 'bad_login'); end if;
  select * into r from city_players where name_key = k;
  if found then
    if r.pass <> crypt(p_pass, r.pass) then return jsonb_build_object('error', 'bad_login'); end if;
    update city_players set seen_at = now() where name_key = k;
    return jsonb_build_object('token', r.token, 'name', r.name);
  end if;
  -- no City account yet: a Brawl player's name and password open one
  bp := bdb_private.city_brawl_pass(k);
  if bp is null or bp <> crypt(p_pass, bp) then return jsonb_build_object('error', 'bad_login'); end if;
  insert into city_players (name_key, name, pass) values (k, btrim(p_name), bp)
    on conflict (name_key) do update set seen_at = now() returning * into r;
  return jsonb_build_object('token', r.token, 'name', r.name);
end $$;

-- Already signed in to Brawl in this browser: that sign-in opens the same account here.
create or replace function public.city_adopt(p_name text, p_brawl_token uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := lower(btrim(coalesce(p_name, ''))); r city_players; bn text; bp text;
begin
  if to_regclass('public.brawl_players') is null then return jsonb_build_object('error', 'bad_token'); end if;
  execute 'select name, pass from public.brawl_players where name_key = $1 and token = $2' into bn, bp using k, p_brawl_token;
  if bp is null then return jsonb_build_object('error', 'bad_token'); end if;
  insert into city_players (name_key, name, pass) values (k, bn, bp)
    on conflict (name_key) do update set seen_at = now() returning * into r;
  return jsonb_build_object('token', r.token, 'name', r.name);
end $$;

-- My cities, newest first, without their contents.
create or replace function public.city_list(p_name text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := bdb_private.city_who(p_name, p_token);
begin
  if k is null then return jsonb_build_object('error', 'bad_token'); end if;
  return jsonb_build_object('cities', coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'seed', c.seed, 'start', c.start, 'population', c.population, 'money', c.money,
                                        'happiness', c.happiness, 'day', c.day, 'rev', c.rev, 'bytes', length(c.data), 'updated_at', c.updated_at)
                     order by c.updated_at desc)
    from city_cities c where c.owner_key = k), '[]'::jsonb));
end $$;

create or replace function public.city_load(p_name text, p_token uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := bdb_private.city_who(p_name, p_token); c city_cities;
begin
  if k is null then return jsonb_build_object('error', 'bad_token'); end if;
  select * into c from city_cities where id = p_id and owner_key = k;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object('id', c.id, 'name', c.name, 'seed', c.seed, 'start', c.start, 'rev', c.rev, 'updated_at', c.updated_at, 'data', c.data);
end $$;

-- Save a city: a new one if the id is not known yet, otherwise over my own copy of it.
create or replace function public.city_save(p_name text, p_token uuid, p_id uuid, p_city text, p_seed integer, p_start text,
                                            p_population integer, p_money bigint, p_happiness integer, p_day integer, p_data text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := bdb_private.city_who(p_name, p_token); c city_cities; nm text := left(btrim(coalesce(p_city, '')), 40);
begin
  if k is null then return jsonb_build_object('error', 'bad_token'); end if;
  if p_id is null or p_seed is null or p_data is null or char_length(nm) < 1 then return jsonb_build_object('error', 'bad_input'); end if;
  if length(p_data) > 1500000 then return jsonb_build_object('error', 'too_big'); end if;
  select * into c from city_cities where id = p_id;
  if found then
    if c.owner_key <> k then return jsonb_build_object('error', 'not_yours'); end if;
    update city_cities set name = nm, seed = p_seed, start = left(p_start, 12), population = greatest(0, coalesce(p_population, 0)), money = coalesce(p_money, 0),
           happiness = least(100, greatest(0, coalesce(p_happiness, 0))), day = greatest(0, coalesce(p_day, 0)), data = p_data, rev = rev + 1, updated_at = now()
     where id = p_id returning * into c;
  else
    if (select count(*) from city_cities where owner_key = k) >= 12 then return jsonb_build_object('error', 'too_many'); end if;
    insert into city_cities (id, owner_key, name, seed, start, population, money, happiness, day, data)
    values (p_id, k, nm, p_seed, left(p_start, 12), greatest(0, coalesce(p_population, 0)), coalesce(p_money, 0),
            least(100, greatest(0, coalesce(p_happiness, 0))), greatest(0, coalesce(p_day, 0)), p_data)
    returning * into c;
  end if;
  return jsonb_build_object('ok', true, 'id', c.id, 'rev', c.rev, 'updated_at', c.updated_at);
end $$;

create or replace function public.city_delete(p_name text, p_token uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := bdb_private.city_who(p_name, p_token);
begin
  if k is null then return jsonb_build_object('error', 'bad_token'); end if;
  delete from city_cities where id = p_id and owner_key = k;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- The table of cities: the fifty biggest, with their mayors. Only a signed-in player can ask,
-- and it gives out names and numbers, never a city's contents.
create or replace function public.city_top(p_name text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := bdb_private.city_who(p_name, p_token);
begin
  if k is null then return jsonb_build_object('error', 'bad_token'); end if;
  return jsonb_build_object('top', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'mayor', t.mayor, 'population', t.population, 'happiness', t.happiness,
                                        'day', t.day, 'updated_at', t.updated_at, 'mine', t.owner_key = k)
                     order by t.population desc, t.updated_at desc)
    from (select c.id, c.name, p.name as mayor, c.owner_key, c.population, c.happiness, c.day, c.updated_at
          from city_cities c join city_players p on p.name_key = c.owner_key
          order by c.population desc, c.updated_at desc limit 50) t), '[]'::jsonb));
end $$;

-- Visit: any signed-in player can open a copy of any city to look around. Nothing is written.
create or replace function public.city_visit(p_name text, p_token uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := bdb_private.city_who(p_name, p_token); c city_cities; m text;
begin
  if k is null then return jsonb_build_object('error', 'bad_token'); end if;
  select * into c from city_cities where id = p_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  select name into m from city_players where name_key = c.owner_key;
  return jsonb_build_object('id', c.id, 'name', c.name, 'mayor', m, 'seed', c.seed, 'rev', c.rev, 'updated_at', c.updated_at, 'data', c.data);
end $$;

revoke all on function bdb_private.city_brawl_pass(text), bdb_private.city_who(text, uuid) from public, anon, authenticated;

revoke all on function public.city_ping(),
  public.city_register(text, text), public.city_login(text, text), public.city_adopt(text, uuid),
  public.city_list(text, uuid), public.city_load(text, uuid, uuid),
  public.city_save(text, uuid, uuid, text, integer, text, integer, bigint, integer, integer, text),
  public.city_delete(text, uuid, uuid), public.city_top(text, uuid), public.city_visit(text, uuid, uuid) from public;
grant execute on function public.city_ping(),
  public.city_register(text, text), public.city_login(text, text), public.city_adopt(text, uuid),
  public.city_list(text, uuid), public.city_load(text, uuid, uuid),
  public.city_save(text, uuid, uuid, text, integer, text, integer, bigint, integer, integer, text),
  public.city_delete(text, uuid, uuid), public.city_top(text, uuid), public.city_visit(text, uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
