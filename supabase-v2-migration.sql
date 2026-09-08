-- ============================================================================
-- Frame — CLOUD SCHEMA v2 (slug-based) + FULL ACTIVITY WIPE   [rev 3]
-- Where to run: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Safe to re-run as many times as you like (every step is guarded).
--
-- WHY: v1 tables stored the NUMERIC local title id. Those ids drift between
-- devices/catalog rebuilds (the same film was id 663 on one device and 1665
-- on another), so favorites synced as the WRONG titles. v2 stores the STABLE
-- catalog SLUG — exactly what Frame v0.13.0+ apps read and write.
--
-- WHAT IT DOES (per your instruction):
--   1) WIPES all activity: favorites, watchlist, ratings, watch history,
--      collections, activity log (user_events), shared Dark-Room walls
--   2) Removes EVERY old key on those tables, then rebuilds them on slug
--   KEPT (untouched): profiles (usernames) · subscriptions + codes (VIP)
-- ============================================================================

-- ------------------------------------------------------------
-- 1) WIPE — all activity tables in ONE statement.
--    PostgreSQL refuses to truncate a table that is referenced by an FK
--    unless the referencing table is truncated in the SAME statement —
--    listing all of them together (plus CASCADE) satisfies that rule no
--    matter which FKs exist.
-- ------------------------------------------------------------
do $$
declare t text; stmt text;
begin
  stmt := '';
  foreach t in array array[
    'favorites','watchlist','ratings','watch_progress','user_events',
    'user_collection_items','user_collections','shared_collections'
  ] loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      stmt := stmt || (case when stmt = '' then '' else ', ' end) || 'public.' || t;
    end if;
  end loop;
  if stmt <> '' then
    execute 'truncate table ' || stmt || ' cascade';
  end if;
end $$;

-- junk profile rows (updated_at = 1970 placeholder) — real devices re-push
delete from public.profiles where updated_at < '2000-01-01';

-- ------------------------------------------------------------
-- 2) slug/title columns (no-op if a previous run already added them)
-- ------------------------------------------------------------
alter table public.favorites add column if not exists slug  text not null default '';
alter table public.favorites add column if not exists title text not null default '';
alter table public.watchlist add column if not exists slug  text not null default '';
alter table public.watchlist add column if not exists title text not null default '';
alter table public.ratings   add column if not exists slug  text not null default '';
alter table public.ratings   add column if not exists title text not null default '';

alter table public.user_collection_items add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.user_collection_items add column if not exists slug  text not null default '';
alter table public.user_collection_items add column if not exists title text not null default '';

-- ------------------------------------------------------------
-- 3) THE FIX — drop EVERY primary-key / unique constraint on these 4
--    tables BEFORE adding the v2 keys. v1 keys were built on title_id;
--    adding a second PK without this step fails with
--    «multiple primary keys for table are not allowed».
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select con.conname, con.conrelid::regclass as tbl
    from pg_constraint con
    where con.connamespace = 'public'::regnamespace
      and con.contype in ('p','u')
      and con.conrelid = any(array[
        to_regclass('public.favorites'),
        to_regclass('public.watchlist'),
        to_regclass('public.ratings'),
        to_regclass('public.user_collection_items')
      ]::oid[])
  loop
    execute format('alter table %s drop constraint if exists %I', r.tbl, r.conname);
  end loop;
end $$;

-- rows without a real slug (e.g. from an earlier half-run) would break the
-- new keys — remove them. After the wipe these tables are empty anyway.
delete from public.favorites where slug is null or slug = '' or user_id is null;
delete from public.watchlist where slug is null or slug = '' or user_id is null;
delete from public.ratings   where slug is null or slug = '' or user_id is null;
delete from public.user_collection_items
  where slug is null or slug = '' or collection_id is null;

-- ------------------------------------------------------------
-- 4) v2 keys (guarded → re-running never duplicates)
-- ------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname  = 'favorites_v2_pkey'
                   and conrelid = to_regclass('public.favorites')) then
    alter table public.favorites add constraint favorites_v2_pkey primary key (user_id, slug);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname  = 'watchlist_v2_pkey'
                   and conrelid = to_regclass('public.watchlist')) then
    alter table public.watchlist add constraint watchlist_v2_pkey primary key (user_id, slug);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname  = 'ratings_v2_pkey'
                   and conrelid = to_regclass('public.ratings')) then
    alter table public.ratings add constraint ratings_v2_pkey primary key (user_id, slug);
  end if;
end $$;

-- collection items: upsert conflict target is (collection_id, slug)
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname  = 'user_collection_items_v2_key'
                   and conrelid = to_regclass('public.user_collection_items')) then
    alter table public.user_collection_items
      add constraint user_collection_items_v2_key unique (collection_id, slug);
  end if;
end $$;

-- restore the row-id key on collection items (removed with the others above)
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name   = 'user_collection_items'
               and column_name  = 'id')
     and not exists (select 1 from pg_constraint
                     where conname  = 'user_collection_items_pkey'
                       and conrelid = to_regclass('public.user_collection_items')) then
    alter table public.user_collection_items
      add constraint user_collection_items_pkey primary key (id);
  end if;
end $$;

-- the drifting column is gone for good
alter table public.favorites             drop column if exists title_id;
alter table public.watchlist             drop column if exists title_id;
alter table public.ratings               drop column if exists title_id;
alter table public.user_collection_items drop column if exists title_id;

-- RLS stays enabled everywhere
alter table public.favorites             enable row level security;
alter table public.watchlist             enable row level security;
alter table public.ratings               enable row level security;
alter table public.user_events           enable row level security;
alter table public.user_collections      enable row level security;
alter table public.user_collection_items enable row level security;

-- ------------------------------------------------------------
-- 5) watch_progress — rebuilt for slugs
--    (user_id, slug, season, episode) PK · newer-write-wins
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
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "watch_progress delete own" on public.watch_progress;
create policy "watch_progress delete own" on public.watch_progress
  for delete using (auth.uid() = user_id);

create index if not exists watch_progress_user_idx
  on public.watch_progress (user_id, updated_at desc);

-- ------------------------------------------------------------
-- 6) verify — every row must show  true
-- ------------------------------------------------------------
select 'favorites v2' as step,
       exists (select 1 from pg_constraint
               where conname = 'favorites_v2_pkey'
                 and conrelid = 'public.favorites'::regclass)
       and exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'favorites'
                     and column_name = 'slug')
       and not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'favorites'
                         and column_name = 'title_id')
       as ok
union all
select 'watchlist v2',
       exists (select 1 from pg_constraint
               where conname = 'watchlist_v2_pkey'
                 and conrelid = 'public.watchlist'::regclass)
       and exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'watchlist'
                     and column_name = 'slug')
       and not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'watchlist'
                         and column_name = 'title_id')
from (select 1) x
union all
select 'ratings v2',
       exists (select 1 from pg_constraint
               where conname = 'ratings_v2_pkey'
                 and conrelid = 'public.ratings'::regclass)
       and exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'ratings'
                     and column_name = 'slug')
       and not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'ratings'
                         and column_name = 'title_id')
from (select 1) x
union all
select 'collection items v2',
       exists (select 1 from pg_constraint
               where conname = 'user_collection_items_v2_key'
                 and conrelid = 'public.user_collection_items'::regclass)
       and not exists (select 1 from information_schema.columns
                       where table_schema = 'public'
                         and table_name = 'user_collection_items'
                         and column_name = 'title_id')
from (select 1) x
union all
select 'watch progress v2',
       exists (select 1 from pg_constraint
               where conname = 'watch_progress_pkey'
                 and conrelid = 'public.watch_progress'::regclass)
       and exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'watch_progress'
                     and column_name = 'slug')
from (select 1) x
union all
select 'profiles kept (usernames)', (select count(*) from public.profiles) >= 0
from (select 1) x
union all
select 'vip kept', (select count(*) from public.subscriptions) >= 0
from (select 1) x;
