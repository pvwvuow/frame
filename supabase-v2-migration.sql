-- ============================================================================
-- Frame — CLOUD SCHEMA v2 (slug-based) + FULL ACTIVITY WIPE
-- Where to run: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Run ONCE. Safe to re-run (every step is guarded / idempotent).
--
-- WHY: the v1 tables stored the NUMERIC local title id. Those ids drift
-- between devices and catalog rebuilds (the same film was id 663 on one
-- device and id 1665 on another), so favorites/watchlist/history synced as
-- the WRONG titles — «I favorited a movie on my phone, a different movie
-- appeared on the desktop». v2 stores the STABLE catalog SLUG instead,
-- which is exactly what Frame v0.13.0+ apps read and write.
--
-- WHAT IT DOES (per your instruction):
--   1) WIPES every user's activity:
--      favorites, watchlist, ratings, watch history, collections,
--      activity log (user_events), shared Dark-Room walls
--   2) Converts the tables to the slug-based v2 shape
--   KEPT (untouched):
--      profiles (usernames) · subscriptions + subscription_codes (VIP)
-- ============================================================================

-- ------------------------------------------------------------
-- 1) WIPE all activity data (usernames + VIP survive)
--    CASCADE is required: user_collection_items has an FK to
--    user_collections, and PostgreSQL refuses to truncate a referenced
--    table unless the referencing tables go in the SAME statement.
--    Nothing outside the activity tables references them, so the cascade
--    cannot touch anything else (profiles / subscriptions are FK-targets,
--    never FK-sources).
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'favorites','watchlist','ratings','watch_progress','user_events',
    'user_collection_items','user_collections','shared_collections'
  ] loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format('truncate table public.%I cascade', t);
    end if;
  end loop;
end $$;

-- drop the junk profile rows (updated_at = 1970, default «کاربر نما» payload)
-- — real devices re-push their profile automatically on the next sync.
delete from public.profiles where updated_at < '2000-01-01';

-- ------------------------------------------------------------
-- 2) favorites / watchlist / ratings → slug identity
--    v2 shape: (user_id, slug, title, …) with PK (user_id, slug)
-- ------------------------------------------------------------
alter table public.favorites add column if not exists slug text not null default '';
alter table public.favorites add column if not exists title text not null default '';
alter table public.watchlist add column if not exists slug text not null default '';
alter table public.watchlist add column if not exists title text not null default '';
alter table public.ratings   add column if not exists slug text not null default '';
alter table public.ratings   add column if not exists title text not null default '';

-- drop every PK/UNIQUE constraint that still uses the drifting title_id
do $$
declare r record;
begin
  for r in
    select con.conname, con.conrelid::regclass as tbl
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.connamespace = 'public'::regnamespace
      and con.contype in ('p','u')
      and att.attname = 'title_id'
      and con.conrelid in (
        'public.favorites'::regclass,
        'public.watchlist'::regclass,
        'public.ratings'::regclass,
        'public.user_collection_items'::regclass
      )
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- v2 primary keys
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.favorites'::regclass and conname = 'favorites_v2_pkey') then
    alter table public.favorites add constraint favorites_v2_pkey primary key (user_id, slug);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.watchlist'::regclass and conname = 'watchlist_v2_pkey') then
    alter table public.watchlist add constraint watchlist_v2_pkey primary key (user_id, slug);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.ratings'::regclass and conname = 'ratings_v2_pkey') then
    alter table public.ratings add constraint ratings_v2_pkey primary key (user_id, slug);
  end if;
end $$;

-- the drifting column is gone for good
alter table public.favorites drop column if exists title_id;
alter table public.watchlist drop column if exists title_id;
alter table public.ratings   drop column if exists title_id;

-- ------------------------------------------------------------
-- 3) user_collection_items → slug identity
--    v2 shape: (collection_id, user_id, slug, title),
--    unique (collection_id, slug) — matches the app's upsert onConflict
-- ------------------------------------------------------------
alter table public.user_collection_items add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.user_collection_items add column if not exists slug  text not null default '';
alter table public.user_collection_items add column if not exists title text not null default '';

do $$ begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.user_collection_items'::regclass
                   and conname  = 'user_collection_items_v2_key') then
    alter table public.user_collection_items
      add constraint user_collection_items_v2_key unique (collection_id, slug);
  end if;
end $$;

alter table public.user_collection_items drop column if exists title_id;

-- ------------------------------------------------------------
-- 4) watch_progress — rebuilt for slugs
--    v2 shape: (user_id, slug, season, episode) PK, newer-write-wins
-- ------------------------------------------------------------
drop table if exists public.watch_progress cascade;

create table public.watch_progress (
  user_id    uuid             not null references auth.users(id) on delete cascade,
  slug       text             not null,
  title      text             not null default '',
  season     int              not null default 0,
  episode    int              not null default 0,
  position   double precision not null default 0,
  duration   double precision not null default 0,
  updated_at timestamptz      not null default now(),
  primary key (user_id, slug, season, episode)
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
  on public.watch_progress (user_id, updated_at desc);

-- ------------------------------------------------------------
-- 5) verify (results should all say "ok")
-- ------------------------------------------------------------
select 'favorites v2'   as check, count(*) filter (where exists (select 1 from information_schema.columns c where c.table_name = 'favorites'   and c.column_name = 'slug' and c.table_schema = 'public')) = 1 and not exists (select 1 from information_schema.columns c where c.table_name = 'favorites'   and c.column_name = 'title_id' and c.table_schema = 'public') as ok
union all
select 'watchlist v2',  count(*) filter (where exists (select 1 from information_schema.columns c where c.table_name = 'watchlist'  and c.column_name = 'slug' and c.table_schema = 'public')) = 1 and not exists (select 1 from information_schema.columns c where c.table_name = 'watchlist'  and c.column_name = 'title_id' and c.table_schema = 'public')
from (select 1) x
union all
select 'ratings v2',    count(*) filter (where exists (select 1 from information_schema.columns c where c.table_name = 'ratings'    and c.column_name = 'slug' and c.table_schema = 'public')) = 1 and not exists (select 1 from information_schema.columns c where c.table_name = 'ratings'    and c.column_name = 'title_id' and c.table_schema = 'public')
from (select 1) x
union all
select 'progress v2',   count(*) filter (where exists (select 1 from information_schema.columns c where c.table_name = 'watch_progress' and c.column_name = 'slug' and c.table_schema = 'public')) = 1 and not exists (select 1 from information_schema.columns c where c.table_name = 'watch_progress' and c.column_name = 'title_id' and c.table_schema = 'public')
from (select 1) x
union all
select 'vip kept',      count(*)
from public.subscriptions;
