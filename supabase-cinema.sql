-- ============================================================
-- Frame × Supabase — CINEMA (watch-party) v0.14.0 + v0.14.2
-- Where to run: Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Adds TWO tables:
--
-- 1) cinema_rooms
--   The host's player publishes its state (what is playing, position,
--   play/pause) here; everyone who joins with the room CODE reads it and
--   syncs. Live control messages ride Supabase Realtime channels
--   (broadcast + presence) — no extra server needed.
--
--   Every viewer streams the video DIRECTLY from Frame's own sources with
--   their own internet — the cloud only relays the tiny control signals.
--
-- 2) cinema_profiles  (v0.14.2)
--   The ONLY profile fields other users may see: display name + avatar.
--   The private profile JSON (profiles.data: settings, PIN, …) stays locked
--   behind its own RLS; this table is readable by every signed-in user so a
--   room can show WHO is inside with their face, not just a letter.
--
-- RLS:
--   cinema_rooms   SELECT → any signed-in user (needed to join by code)
--                  INSERT/UPDATE/DELETE → the host only (auth.uid() = host_id)
--   cinema_profiles SELECT → any signed-in user (member list)
--                   INSERT/UPDATE → own row only
--
-- Safe to re-run (fully idempotent).
-- ============================================================

create table if not exists public.cinema_rooms (
  id         uuid             primary key default gen_random_uuid(),
  code       text             not null unique,
  host_id    uuid             not null references auth.users(id) on delete cascade,
  host_name  text             not null default '',
  slug       text             not null,
  title      text             not null default '',
  poster     text             not null default '',
  kind       text             not null default 'movie',   -- movie | series
  season     int              not null default 0,
  epnum      int              not null default 0,
  position   double precision not null default 0,
  duration   double precision not null default 0,
  is_playing boolean          not null default false,
  is_closed  boolean          not null default false,
  updated_at timestamptz      not null default now()
);

create index if not exists cinema_rooms_updated_idx on public.cinema_rooms (updated_at desc);
create index if not exists cinema_rooms_host_idx    on public.cinema_rooms (host_id);

-- ---------- Row Level Security ----------
alter table public.cinema_rooms enable row level security;

drop policy if exists "cinema rooms read" on public.cinema_rooms;
create policy "cinema rooms read" on public.cinema_rooms
  for select to authenticated
  using (true);

drop policy if exists "cinema rooms insert" on public.cinema_rooms;
create policy "cinema rooms insert" on public.cinema_rooms
  for insert to authenticated
  with check (auth.uid() = host_id);

drop policy if exists "cinema rooms update" on public.cinema_rooms;
create policy "cinema rooms update" on public.cinema_rooms
  for update to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

drop policy if exists "cinema rooms delete" on public.cinema_rooms;
create policy "cinema rooms delete" on public.cinema_rooms
  for delete to authenticated
  using (auth.uid() = host_id);

-- housekeeping: rooms die by themselves — the host row is removed when the
-- user account is deleted; stale rooms older than 12h are swept on host create
-- (client side). Nothing else to do here.

-- ============================================================
-- v0.14.2 — cinema_profiles: who you are in the member list
--   display_name + avatar_image are the ONLY public profile fields.
--   The client upserts its own row on every profile save / sync.
--   avatar_image is a small data URL (client downsizes to 320×320
--   JPEG, ≤ ~300KB).
-- v0.29.1 — the base table is OWN-ROW ONLY. Other members' identities
--   are fetched through the scoped cinema_member_profiles RPC below;
--   the old «using (true)» SELECT let any account harvest every
--   user's uuid + name + avatar (confirmed live via pg_policies dump).
-- ============================================================

create table if not exists public.cinema_profiles (
  user_id      uuid        primary key references auth.users(id) on delete cascade,
  display_name text        not null default '',
  avatar_image text        not null default '',
  updated_at   timestamptz not null default now()
);

alter table public.cinema_profiles enable row level security;

drop policy if exists "cinema profiles read" on public.cinema_profiles;
create policy "cinema profiles read" on public.cinema_profiles
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "cinema profiles insert" on public.cinema_profiles;
create policy "cinema profiles insert" on public.cinema_profiles
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "cinema profiles update" on public.cinema_profiles;
create policy "cinema profiles update" on public.cinema_profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- v0.29.1 - scoped identity lookup for cinema member lists.
-- The caller must ALREADY know the uuids (they arrive via realtime
-- presence), so this is not a harvesting oracle: it can never LIST
-- profiles. It only fetches explicitly-requested ids, capped at 30.
-- SECURITY DEFINER bypasses the own-row RLS on purpose; the base
-- table itself stays locked to own-row reads.
create or replace function public.cinema_member_profiles(p_uids uuid[])
returns table (user_id uuid, display_name text, avatar_image text)
language sql
stable
security definer
set search_path = public
as $fn$
  select cp.user_id, cp.display_name, cp.avatar_image
  from public.cinema_profiles cp
  where cardinality(p_uids) <= 30
    and cp.user_id = any (p_uids)
  limit 30;
$fn$;

revoke execute on function public.cinema_member_profiles(uuid[]) from anon, public;
grant  execute on function public.cinema_member_profiles(uuid[]) to authenticated;

-- verify (both rows must be true)
select 'cinema_rooms ready'  as step, to_regclass('public.cinema_rooms')  is not null as ok
union all
select 'cinema_profiles ready', to_regclass('public.cinema_profiles') is not null;
