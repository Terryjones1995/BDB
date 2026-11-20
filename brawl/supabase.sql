-- Break Room Brawl: accounts, cloud saves, who's online, invites, the league table, profiles and trade offers.
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

-- one call: I am still here, who else is, any invites waiting for me, anything a trade has sent me, and how many offers wait for my answer
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
    'invites', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'from', i.from_name, 'kind', i.kind, 'code', i.code) order by i.id) from brawl_invites i where i.to_key = k), '[]'::jsonb),
    'mail', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'items', m.items, 'why', m.why, 'who', m.who) order by m.id) from brawl_mail m where m.to_key = k), '[]'::jsonb),
    'offers', (select count(*) from brawl_offers o where o.to_key = k and o.status = 'open'));
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

-- The league table: everyone with an account, by how far up the ladder they are, then trophies, then wins. Only a signed-in player can ask for it,
-- and it gives out nothing but names and those three numbers.
create or replace function public.brawl_top(p_name text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from brawl_players where name_key = lower(btrim(coalesce(p_name, ''))) and token = p_token) then return jsonb_build_object('error', 'bad_token'); end if;
  return jsonb_build_object('top', coalesce((
    select jsonb_agg(jsonb_build_object('name', t.name, 'ladder', t.ladder, 'trophies', t.trophies, 'wins', t.wins, 'on', t.seen_at > now() - interval '75 seconds') order by t.ladder desc, t.trophies desc, t.wins desc, t.name)
    from (select p.name, p.seen_at,
                 case when p.data->>'ladder' ~ '^[0-9]{1,6}$' then (p.data->>'ladder')::int else 0 end as ladder,
                 case when p.data->>'trophies' ~ '^[0-9]{1,9}$' then (p.data->>'trophies')::int else 0 end as trophies,
                 case when p.data#>>'{stats,w}' ~ '^[0-9]{1,9}$' then (p.data#>>'{stats,w}')::int else 0 end as wins
          from brawl_players p order by 3 desc, 4 desc, 5 desc, 1 limit 50) t), '[]'::jsonb));
end $$;
revoke all on function public.brawl_top(text, uuid) from public;
grant execute on function public.brawl_top(text, uuid) to anon, authenticated;

revoke all on function public.brawl_register(text, text, jsonb), public.brawl_login(text, text), public.brawl_load(text, uuid), public.brawl_save(text, uuid, jsonb),
  public.brawl_ping(text, uuid, text), public.brawl_invite(text, uuid, text, text, text), public.brawl_invite_done(text, uuid, bigint) from public;
grant execute on function public.brawl_register(text, text, jsonb), public.brawl_login(text, text), public.brawl_load(text, uuid), public.brawl_save(text, uuid, jsonb),
  public.brawl_ping(text, uuid, text), public.brawl_invite(text, uuid, text, text, text), public.brawl_invite_done(text, uuid, bigint) to anon, authenticated;

-- Trade offers. One player offers another some cards and coins for some of theirs, whether or not the other is on right now, and the other
-- accepts, turns it down, or answers with an offer of their own (a counter). What an offer gives leaves the sender's save when it is sent and is
-- held here until it is answered; anything a trade sends a player (what they got, or their own offer coming back) waits in brawl_mail until
-- their game picks it up. An offer nobody answers comes back after seven days. A bundle is {"coins": n, "cards": [{"id": "...", "lvl": n}]}.
create table if not exists public.brawl_offers (
  id         bigint generated always as identity primary key,
  from_key   text not null, from_name text not null,
  to_key     text not null, to_name   text not null,
  give       jsonb not null,                         -- what the sender gives
  want       jsonb not null,                         -- what the sender asks for
  status     text not null default 'open',           -- open, accepted, declined, cancelled, countered, expired
  reply_to   bigint,                                 -- the offer this one answers, for a counter
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);
create index if not exists brawl_offers_to on public.brawl_offers (to_key, status);
create index if not exists brawl_offers_from on public.brawl_offers (from_key, status);
create table if not exists public.brawl_mail (
  id         bigint generated always as identity primary key,
  to_key     text not null,
  items      jsonb not null,                         -- a bundle
  why        text not null,                          -- got (you accepted their offer), paid (they accepted yours), back (your offer came back)
  who        text not null default '',               -- the other player
  offer_id   bigint,
  created_at timestamptz not null default now()
);
create index if not exists brawl_mail_to on public.brawl_mail (to_key, id);
alter table public.brawl_offers enable row level security;
alter table public.brawl_mail enable row level security;

create or replace function public.brawl_bundle_ok(b jsonb) returns boolean language sql immutable as $$
  select coalesce(jsonb_typeof(b) = 'object'
    and jsonb_typeof(b->'coins') = 'number' and (b->>'coins') ~ '^[0-9]{1,7}$' and (b->>'coins')::int <= 1000000
    and jsonb_typeof(b->'cards') = 'array' and jsonb_array_length(b->'cards') <= 5
    and not exists (select 1 from jsonb_array_elements(b->'cards') c where jsonb_typeof(c) <> 'object' or coalesce(c->>'id', '') !~ '^[a-z0-9]{1,24}-[a-z]{1,12}$' or coalesce(c->>'lvl', '') !~ '^[0-9]{1,2}$')
    and (select count(distinct c->>'id') from jsonb_array_elements(b->'cards') c) = jsonb_array_length(b->'cards'), false)
$$;
create or replace function public.brawl_bundle_empty(b jsonb) returns boolean language sql immutable as $$ select (b->>'coins')::int = 0 and jsonb_array_length(b->'cards') = 0 $$;
-- offers left open for a week go back to whoever made them
create or replace function public.brawl_expire() returns void language plpgsql security definer set search_path = public as $$
declare o record;
begin
  for o in update brawl_offers set status = 'expired', closed_at = now() where status = 'open' and created_at < now() - interval '7 days' returning * loop
    insert into brawl_mail (to_key, items, why, who, offer_id) values (o.from_key, o.give, 'back', o.to_name, o.id);
  end loop;
end $$;

-- another player's profile: who they are, how far they have got, what they have won, their decks and their cards (to pick from for an offer)
create or replace function public.brawl_profile(p_name text, p_token uuid, p_who text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r brawl_players;
begin
  if not exists (select 1 from brawl_players where name_key = lower(btrim(coalesce(p_name, ''))) and token = p_token) then return jsonb_build_object('error', 'bad_token'); end if;
  select * into r from brawl_players where name_key = lower(btrim(coalesce(p_who, '')));
  if not found then return jsonb_build_object('error', 'no_player'); end if;
  return jsonb_build_object('name', r.name, 'on', r.seen_at > now() - interval '75 seconds', 'status', r.status,
    'seen', floor(extract(epoch from r.seen_at) * 1000), 'since', floor(extract(epoch from r.created_at) * 1000),
    'p', jsonb_build_object('cards', coalesce(r.data->'cards', '{}'::jsonb), 'decks', coalesce(r.data->'decks', '[]'::jsonb), 'ladder', r.data->'ladder', 'trophies', r.data->'trophies',
                            'stats', coalesce(r.data->'stats', '{}'::jsonb), 'ms', coalesce(r.data->'ms', '{}'::jsonb), 'best', r.data->'best', 'bn', r.data->'bn', 'bounty', r.data->'bounty', 'made', r.data->'made'));
end $$;

-- make an offer, or (p_reply) answer one made to you with one of your own, which sends the first one back to whoever made it
create or replace function public.brawl_offer(p_name text, p_token uuid, p_to text, p_give jsonb, p_want jsonb, p_reply bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare me brawl_players; t brawl_players; o brawl_offers; nid bigint;
begin
  select * into me from brawl_players where name_key = lower(btrim(coalesce(p_name, ''))) and token = p_token;
  if not found then return jsonb_build_object('error', 'bad_token'); end if;
  select * into t from brawl_players where name_key = lower(btrim(coalesce(p_to, '')));
  if not found or t.name_key = me.name_key then return jsonb_build_object('error', 'no_player'); end if;
  if not brawl_bundle_ok(p_give) or not brawl_bundle_ok(p_want) then return jsonb_build_object('error', 'bad_input'); end if;
  if brawl_bundle_empty(p_give) and brawl_bundle_empty(p_want) then return jsonb_build_object('error', 'empty'); end if;
  if (select count(*) from brawl_offers where from_key = me.name_key and status = 'open') >= 10 then return jsonb_build_object('error', 'too_many'); end if;
  if p_reply is not null then
    select * into o from brawl_offers where id = p_reply and to_key = me.name_key and from_key = t.name_key and status = 'open' for update;
    if not found then return jsonb_build_object('error', 'gone'); end if;
    update brawl_offers set status = 'countered', closed_at = now() where id = o.id;
    insert into brawl_mail (to_key, items, why, who, offer_id) values (o.from_key, o.give, 'back', me.name, o.id);
  end if;
  insert into brawl_offers (from_key, from_name, to_key, to_name, give, want, reply_to) values (me.name_key, me.name, t.name_key, t.name, p_give, p_want, p_reply) returning id into nid;
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

-- the offers you have made and been made: open ones, and the last few days' closed ones
create or replace function public.brawl_offers(p_name text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := lower(btrim(coalesce(p_name, '')));
begin
  if not exists (select 1 from brawl_players where name_key = k and token = p_token) then return jsonb_build_object('error', 'bad_token'); end if;
  perform brawl_expire();
  return jsonb_build_object('offers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'from', o.from_name, 'to', o.to_name, 'mine', o.from_key = k, 'give', o.give, 'want', o.want, 'status', o.status, 'reply', o.reply_to,
      'at', floor(extract(epoch from o.created_at) * 1000), 'closed', floor(extract(epoch from o.closed_at) * 1000)) order by o.status = 'open' desc, o.id desc)
    from (select * from brawl_offers where (from_key = k or to_key = k) and (status = 'open' or closed_at > now() - interval '3 days') order by id desc limit 40) o), '[]'::jsonb));
end $$;

-- yes: the trade goes through. You get what they gave, they get what they asked for (your game takes it out of your save once this says ok).
-- no: what they gave goes back to them
create or replace function public.brawl_offer_answer(p_name text, p_token uuid, p_id bigint, p_yes boolean)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare me brawl_players; o brawl_offers;
begin
  select * into me from brawl_players where name_key = lower(btrim(coalesce(p_name, ''))) and token = p_token;
  if not found then return jsonb_build_object('error', 'bad_token'); end if;
  select * into o from brawl_offers where id = p_id and to_key = me.name_key and status = 'open' for update;
  if not found then return jsonb_build_object('error', 'gone'); end if;
  if p_yes then
    update brawl_offers set status = 'accepted', closed_at = now() where id = o.id;
    insert into brawl_mail (to_key, items, why, who, offer_id) values (me.name_key, o.give, 'got', o.from_name, o.id), (o.from_key, o.want, 'paid', me.name, o.id);
  else
    update brawl_offers set status = 'declined', closed_at = now() where id = o.id;
    insert into brawl_mail (to_key, items, why, who, offer_id) values (o.from_key, o.give, 'back', me.name, o.id);
  end if;
  return jsonb_build_object('ok', true, 'want', o.want);
end $$;

-- take back an offer you made that is still open
create or replace function public.brawl_offer_cancel(p_name text, p_token uuid, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare me brawl_players; o brawl_offers;
begin
  select * into me from brawl_players where name_key = lower(btrim(coalesce(p_name, ''))) and token = p_token;
  if not found then return jsonb_build_object('error', 'bad_token'); end if;
  update brawl_offers set status = 'cancelled', closed_at = now() where id = p_id and from_key = me.name_key and status = 'open' returning * into o;
  if not found then return jsonb_build_object('error', 'gone'); end if;
  insert into brawl_mail (to_key, items, why, who, offer_id) values (me.name_key, o.give, 'back', o.to_name, o.id);
  return jsonb_build_object('ok', true);
end $$;

-- the game has put these into the save: they can go
create or replace function public.brawl_mail_done(p_name text, p_token uuid, p_ids bigint[])
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := lower(btrim(coalesce(p_name, '')));
begin
  if not exists (select 1 from brawl_players where name_key = k and token = p_token) then return jsonb_build_object('error', 'bad_token'); end if;
  delete from brawl_mail where to_key = k and id = any(coalesce(p_ids, '{}'));
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.brawl_bundle_ok(jsonb), public.brawl_bundle_empty(jsonb), public.brawl_expire() from public, anon, authenticated;
revoke all on function public.brawl_profile(text, uuid, text), public.brawl_offer(text, uuid, text, jsonb, jsonb, bigint), public.brawl_offers(text, uuid),
  public.brawl_offer_answer(text, uuid, bigint, boolean), public.brawl_offer_cancel(text, uuid, bigint), public.brawl_mail_done(text, uuid, bigint[]) from public;
grant execute on function public.brawl_profile(text, uuid, text), public.brawl_offer(text, uuid, text, jsonb, jsonb, bigint), public.brawl_offers(text, uuid),
  public.brawl_offer_answer(text, uuid, bigint, boolean), public.brawl_offer_cancel(text, uuid, bigint), public.brawl_mail_done(text, uuid, bigint[]) to anon, authenticated;

notify pgrst, 'reload schema';
