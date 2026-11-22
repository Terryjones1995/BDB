-- BDB Craft: worlds saved on the server, and the list of worlds friends are playing in right now.
-- Run this once in the Supabase SQL editor, after brawl/supabase.sql (Craft uses the same accounts). It is safe to run again.
-- Like Brawl, the tables have row level security on and no policies: the page can only call the functions below.

create table if not exists public.craft_worlds (
  id         bigint generated always as identity primary key,
  owner_key  text not null references public.brawl_players(name_key) on delete cascade,
  title      text not null,
  seed       bigint not null,
  kind       text not null default 'normal',              -- normal or flat
  meta       jsonb not null default '{}'::jsonb,          -- where the owner was standing, the time of day, anything small
  live_code  text,                                        -- the join code while the owner has it open to friends
  live_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists craft_worlds_owner on public.craft_worlds (owner_key, updated_at desc);
create index if not exists craft_worlds_live on public.craft_worlds (live_at) where live_code is not null;
create table if not exists public.craft_chunks (
  world_id   bigint not null references public.craft_worlds(id) on delete cascade,
  cx         int not null,
  cz         int not null,
  d          text not null,                               -- the 16 x 16 x 128 blocks, deflated, base64
  primary key (world_id, cx, cz)
);
alter table public.craft_worlds enable row level security;
alter table public.craft_chunks enable row level security;

create or replace function public.craft_who(p_name text, p_token uuid)
returns text language sql stable security definer set search_path = public as $$
  select name_key from brawl_players where name_key = lower(btrim(coalesce(p_name, ''))) and token = p_token
$$;

create or replace function public.craft_list(p_name text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text := craft_who(p_name, p_token);
begin
  if k is null then return jsonb_build_object('error', 'bad_token'); end if;
  update brawl_players set seen_at = now() where name_key = k;
  return jsonb_build_object(
    'mine', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.title, 'seed', w.seed, 'kind', w.kind, 'updated', w.updated_at,
              'chunks', (select count(*) from craft_chunks c where c.world_id = w.id)) order by w.updated_at desc) from craft_worlds w where w.owner_key = k), '[]'::jsonb),
    'live', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.title, 'host', p.name, 'code', w.live_code, 'kind', w.kind) order by w.live_at desc)
              from craft_worlds w join brawl_players p on p.name_key = w.owner_key
              where w.live_code is not null and w.live_at > now() - interval '50 seconds' and w.owner_key <> k), '[]'::jsonb));
end $$;

create or replace function public.craft_new(p_name text, p_token uuid, p_title text, p_seed bigint, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text := craft_who(p_name, p_token); t text := left(btrim(coalesce(p_title, '')), 40); r craft_worlds;
begin
  if k is null then return jsonb_build_object('error', 'bad_token'); end if;
  if t = '' or p_seed is null or p_kind not in ('normal', 'flat') then return jsonb_build_object('error', 'bad_input'); end if;
  if (select count(*) from craft_worlds where owner_key = k) >= 40 then return jsonb_build_object('error', 'too_many'); end if;
  insert into craft_worlds (owner_key, title, seed, kind) values (k, t, p_seed, p_kind) returning * into r;
  return jsonb_build_object('id', r.id, 'name', r.title, 'seed', r.seed, 'kind', r.kind);
end $$;

create or replace function public.craft_rename(p_name text, p_token uuid, p_id bigint, p_title text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text := craft_who(p_name, p_token); t text := left(btrim(coalesce(p_title, '')), 40);
begin
  if k is null then return jsonb_build_object('error', 'bad_token'); end if;
  if t = '' then return jsonb_build_object('error', 'bad_input'); end if;
  update craft_worlds set title = t where id = p_id and owner_key = k;
  if not found then return jsonb_build_object('error', 'not_yours'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.craft_delete(p_name text, p_token uuid, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text := craft_who(p_name, p_token);
begin
  if k is null then return jsonb_build_object('error', 'bad_token'); end if;
  delete from craft_worlds where id = p_id and owner_key = k;
  if not found then return jsonb_build_object('error', 'not_yours'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- 300 chunks at a time; p_after is how many were already sent, and more says where to carry on (null when that was all of them)
create or replace function public.craft_load(p_name text, p_token uuid, p_id bigint, p_after int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text := craft_who(p_name, p_token); r craft_worlds; n int; a int := greatest(coalesce(p_after, 0), 0);
begin
  if k is null then return jsonb_build_object('error', 'bad_token'); end if;
  select * into r from craft_worlds where id = p_id and owner_key = k;
  if not found then return jsonb_build_object('error', 'not_yours'); end if;
  select count(*) into n from craft_chunks where world_id = p_id;
  return jsonb_build_object(
    'world', jsonb_build_object('id', r.id, 'name', r.title, 'seed', r.seed, 'kind', r.kind, 'meta', r.meta),
    'chunks', coalesce((select jsonb_agg(jsonb_build_object('cx', c.cx, 'cz', c.cz, 'd', c.d)) from (select * from craft_chunks where world_id = p_id order by cx, cz offset a limit 300) c), '[]'::jsonb),
    'more', case when a + 300 < n then a + 300 else null end);
end $$;

-- p_chunks: [{cx, cz, d}], at most 250 a call; a chunk with d = '' is put back the way the world made it
create or replace function public.craft_save(p_name text, p_token uuid, p_id bigint, p_chunks jsonb, p_meta jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text := craft_who(p_name, p_token); c jsonb;
begin
  if k is null then return jsonb_build_object('error', 'bad_token'); end if;
  if not exists (select 1 from craft_worlds where id = p_id and owner_key = k) then return jsonb_build_object('error', 'not_yours'); end if;
  if jsonb_typeof(coalesce(p_chunks, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_chunks, '[]'::jsonb)) > 250 then return jsonb_build_object('error', 'bad_input'); end if;
  if pg_column_size(coalesce(p_meta, '{}'::jsonb)) > 20000 then return jsonb_build_object('error', 'too_big'); end if;
  for c in select * from jsonb_array_elements(coalesce(p_chunks, '[]'::jsonb)) loop
    if coalesce(c->>'d', '') = '' then delete from craft_chunks where world_id = p_id and cx = (c->>'cx')::int and cz = (c->>'cz')::int; continue; end if;
    if char_length(c->>'d') > 60000 then return jsonb_build_object('error', 'too_big'); end if;
    insert into craft_chunks (world_id, cx, cz, d) values (p_id, (c->>'cx')::int, (c->>'cz')::int, c->>'d')
      on conflict (world_id, cx, cz) do update set d = excluded.d;
  end loop;
  if (select count(*) from craft_chunks where world_id = p_id) > 20000 then raise exception 'craft world too big'; end if;
  update craft_worlds set meta = coalesce(p_meta, meta), updated_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- open to friends (p_code set, call again every 20 seconds to stay on the list) or closed (p_code empty)
create or replace function public.craft_live(p_name text, p_token uuid, p_id bigint, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text := craft_who(p_name, p_token);
begin
  if k is null then return jsonb_build_object('error', 'bad_token'); end if;
  update craft_worlds set live_code = nullif(left(btrim(coalesce(p_code, '')), 12), ''), live_at = case when coalesce(p_code, '') = '' then null else now() end
    where id = p_id and owner_key = k;
  if not found then return jsonb_build_object('error', 'not_yours'); end if;
  update brawl_players set seen_at = now() where name_key = k;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.craft_who(text, uuid) from public, anon, authenticated;
grant execute on function public.craft_list(text, uuid), public.craft_new(text, uuid, text, bigint, text), public.craft_rename(text, uuid, bigint, text),
  public.craft_delete(text, uuid, bigint), public.craft_load(text, uuid, bigint, int), public.craft_save(text, uuid, bigint, jsonb, jsonb),
  public.craft_live(text, uuid, bigint, text) to anon, authenticated;
