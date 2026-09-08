-- Frame v0.12.0 — FULL account sync tables
-- ─────────────────────────────────────────────────────────────────────
-- Run this ONCE in the Supabase SQL editor (alongside the existing
-- supabase-setup.sql). From now on EVERYTHING user-related follows the
-- account across devices: avatar, display name, settings, favorites,
-- watchlist, ratings, collections AND watch history (continue watching).
--
--  profiles        → the user's whole local profile as JSON (name, avatar
--                    image data-URL, playback settings…), newer-write-wins
--  watch_progress  → play positions per title, newer-write-wins

-- ── profiles ─────────────────────────────────────────────────────────
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (auth.uid() = user_id);

-- ── watch_progress ───────────────────────────────────────────────────
create table if not exists public.watch_progress (
  user_id    uuid not null references auth.users(id) on delete cascade,
  title_id   bigint not null,
  episode_id bigint,
  position   double precision not null default 0,
  duration   double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

alter table public.watch_progress enable row level security;

drop policy if exists "watch_progress select own" on public.watch_progress;
create policy "watch_progress select own" on public.watch_progress
  for select using (auth.uid() = user_id);

drop policy if exists "watch_progress insert own" on public.watch_progress;
create policy "watch_progress insert own" on public.watch_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "watch_progress update own" on public.watch_progress;
create policy "watch_progress update own" on public.watch_progress
  for update using (auth.uid() = user_id);

drop policy if exists "watch_progress delete own" on public.watch_progress;
create policy "watch_progress delete own" on public.watch_progress
  for delete using (auth.uid() = user_id);

create index if not exists watch_progress_user_idx
  on public.watch_progress(user_id, updated_at desc);
