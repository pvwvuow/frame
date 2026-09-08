-- ============================================================
-- Frame × Supabase — CINEMA (watch-party) v0.14.0
-- Where to run: Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Adds ONE table: cinema_rooms
--   The host's player publishes its state (what is playing, position,
--   play/pause) here; everyone who joins with the room CODE reads it and
--   syncs. Live control messages ride Supabase Realtime channels
--   (broadcast + presence) — no extra server needed.
--
--   Every viewer streams the video DIRECTLY from Frame's own sources with
--   their own internet — the cloud only relays the tiny control signals.
--
-- RLS:
--   SELECT  → any signed-in user (needed to join by code)
--   INSERT/UPDATE/DELETE → the host only (auth.uid() = host_id)
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
