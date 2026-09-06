-- ============================================================
-- Frame × Supabase — one-time setup
-- Where to run: Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Creates 4 tables (favorites / watchlist / ratings / user_events)
-- with Row Level Security so every user can only touch their OWN rows.
--
-- Recommended after running:
--   Dashboard → Authentication → Providers → Email →
--   turn OFF "Confirm email"  (so users can log in instantly;
--   Supabase's free email quota is tiny and mails often land in spam)
--
-- SECURITY REMINDER:
--   Only the sb_publishable_* key belongs inside the Frame app.
--   The sb_secret_* key bypasses RLS — never ship it in the app.
-- ============================================================

create table if not exists public.favorites (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  title_id   bigint      not null,
  created_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

create table if not exists public.watchlist (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  title_id   bigint      not null,
  status     text        not null default 'planned',
  updated_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

create table if not exists public.ratings (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  title_id   bigint      not null,
  score      int         not null check (score between 1 and 10),
  updated_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

create table if not exists public.user_events (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  type       text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_events_user_created_idx on public.user_events (user_id, created_at desc);

alter table public.favorites   enable row level security;
alter table public.watchlist   enable row level security;
alter table public.ratings     enable row level security;
alter table public.user_events enable row level security;

drop policy if exists "favorites: own rows" on public.favorites;
create policy "favorites: own rows" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "watchlist: own rows" on public.watchlist;
create policy "watchlist: own rows" on public.watchlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ratings: own rows" on public.ratings;
create policy "ratings: own rows" on public.ratings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_events: own rows" on public.user_events;
create policy "user_events: own rows" on public.user_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
