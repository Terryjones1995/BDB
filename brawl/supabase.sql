-- Break Room Brawl: accounts, cloud saves, who's online and invites.
-- Run this once in the Supabase SQL editor (it is safe to run again).
-- Players sign in with a name and a password. The tables have row level security on and no policies,
-- so nothing can read or write them directly: the page can only call the functions below.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.brawl_players (
  name_key   text primary key,                       -- the name in lower case
  name       text not null,
  pass       text not null,                          -- bcrypt hash, never the password itself
  token      uuid not null default gen_random_uuid(),
  data       jsonb not null default '{}'::jsonb,     -- the whole save: coins, cards, decks, friends
  status     text not null default 'menu',
  seen_at    timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.brawl_invites (
  id         bigint generated always as identity primary key,
  to_key     text not null,
  from_name  text not null,
  kind       text not null,                          -- duel, coop or trade
  code       text not null,
  created_at timestamptz not null default now()
);
create index if not exists brawl_invites_to on public.brawl_invites (to_key, id);
alter table public.brawl_players enable row level security;
alter table public.brawl_invites enable row level security;

create or replace function public.brawl_register(p_name text, p_pass text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := lower(btrim(coalesce(p_name, ''))); t uuid;
begin
  if char_length(k) < 2 or char_length(k) > 20 or p_pass is null or char_length(p_pass) < 4 or char_length(p_pass) > 72 then return jsonb_build_object('error', 'bad_input'); end if;
  if pg_column_size(coalesce(p_data, '{}'::jsonb)) > 400000 then return jsonb_build_object('error', 'too_big'); end if;
  begin
    insert into brawl_players (name_key, name, pass, data) values (k, btrim(p_name), crypt(p_pass, gen_salt('bf', 8)), coalesce(p_data, '{}'::jsonb)) returning token into t;
  exception when unique_violation then return jsonb_build_object('error', 'taken');
  end;
  return jsonb_build_object('token', t, 'name', btrim(p_name));
end $$;

create or replace function public.brawl_login(p_name text, p_pass text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r brawl_players;
begin
  select * into r from brawl_players where name_key = lower(btrim(coalesce(p_name, '')));
  if not found or p_pass is null or r.pass <> crypt(p_pass, r.pass) then return jsonb_build_object('error', 'bad_login'); end if;
  update brawl_players set seen_at = now() where name_key = r.name_key;
  return jsonb_build_object('token', r.token, 'name', r.name, 'data', r.data);
end $$;

create or replace function public.brawl_load(p_name text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r brawl_players;
begin
  select * into r from brawl_players where name_key = lower(btrim(coalesce(p_name, ''))) and token = p_token;
  if not found then return jsonb_build_object('error', 'bad_token'); end if;
  return jsonb_build_object('name', r.name, 'data', r.data);
end $$;

create or replace function public.brawl_save(p_name text, p_token uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_data is null or pg_column_size(p_data) > 400000 then return jsonb_build_object('error', 'too_big'); end if;
  update brawl_players set data = p_data, updated_at = now(), seen_at = now() where name_key = lower(btrim(coalesce(p_name, ''))) and token = p_token;
  if not found then return jsonb_build_object('error', 'bad_token'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- one call: I am still here, who else is, and any invites waiting for me
create or replace function public.brawl_ping(p_name text, p_token uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := lower(btrim(coalesce(p_name, '')));
begin
  update brawl_players set seen_at = now(), status = left(coalesce(p_status, 'menu'), 12) where name_key = k and token = p_token;
  if not found then return jsonb_build_object('error', 'bad_token'); end if;
  delete from brawl_invites where created_at < now() - interval '2 minutes';
  return jsonb_build_object(
    'online', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'status', p.status, 'trophies', case when p.data->>'trophies' ~ '^[0-9]{1,9}$' then (p.data->>'trophies')::int else 0 end) order by p.name)
                        from brawl_players p where p.seen_at > now() - interval '75 seconds' and p.name_key <> k), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'from', i.from_name, 'kind', i.kind, 'code', i.code) order by i.id) from brawl_invites i where i.to_key = k), '[]'::jsonb));
end $$;

create or replace function public.brawl_invite(p_name text, p_token uuid, p_to text, p_kind text, p_code text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r brawl_players;
begin
  select * into r from brawl_players where name_key = lower(btrim(coalesce(p_name, ''))) and token = p_token;
  if not found then return jsonb_build_object('error', 'bad_token'); end if;
  if p_kind not in ('duel', 'coop', 'trade') or p_code !~ '^[a-z0-9]{4,12}$' or not exists (select 1 from brawl_players where name_key = lower(btrim(coalesce(p_to, '')))) then return jsonb_build_object('error', 'bad_input'); end if;
  delete from brawl_invites where from_name = r.name;                       -- one live invite per player
  insert into brawl_invites (to_key, from_name, kind, code) values (lower(btrim(p_to)), r.name, p_kind, p_code);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.brawl_invite_done(p_name text, p_token uuid, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := lower(btrim(coalesce(p_name, '')));
begin
  if not exists (select 1 from brawl_players where name_key = k and token = p_token) then return jsonb_build_object('error', 'bad_token'); end if;
  delete from brawl_invites where id = p_id and to_key = k;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.brawl_register(text, text, jsonb), public.brawl_login(text, text), public.brawl_load(text, uuid), public.brawl_save(text, uuid, jsonb),
  public.brawl_ping(text, uuid, text), public.brawl_invite(text, uuid, text, text, text), public.brawl_invite_done(text, uuid, bigint) from public;
grant execute on function public.brawl_register(text, text, jsonb), public.brawl_login(text, text), public.brawl_load(text, uuid), public.brawl_save(text, uuid, jsonb),
  public.brawl_ping(text, uuid, text), public.brawl_invite(text, uuid, text, text, text), public.brawl_invite_done(text, uuid, bigint) to anon, authenticated;

notify pgrst, 'reload schema';
