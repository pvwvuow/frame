-- ============================================================
-- Frame × Supabase — SHARED COLLECTIONS WALL (تاریکخانه) v0.10.34
-- Where to run: Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Adds the public wall where users PUBLISH one of their private
-- collections so every Frame user (even signed-out) can browse it in
-- the Darkroom section:
--
--   shared_collections   (owner + name + denormalized items jsonb)
--
-- RLS:
--   SELECT  → everyone (anon included) — it is a public wall
--   INSERT/UPDATE/DELETE → owner only (auth.uid() = owner_id)
--
-- Items are denormalized ({id,title,poster,year,type,rating} jsonb) so
-- every device renders the wall without catalog lookups; the ids are
-- real catalog ids, so viewers can open/save the titles normally.
--
-- Run AFTER (or together with) supabase-setup.sql + supabase-collections.sql.
-- ============================================================

create table if not exists public.shared_collections (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  owner_name  text        not null default '',
  name        text        not null,
  description text        not null default '',
  items       jsonb       not null default '[]'::jsonb,
  item_count  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, name)
);

create index if not exists shared_collections_owner_idx  on public.shared_collections (owner_id);
create index if not exists shared_collections_recent_idx on public.shared_collections (updated_at desc);

-- ---------- Row Level Security ----------
alter table public.shared_collections enable row level security;

-- public read (the wall is visible to everyone, signed-out included)
drop policy if exists "shared collections public read" on public.shared_collections;
create policy "shared collections public read" on public.shared_collections
  for select using (true);

-- owner-only writes (drop+recreate so re-running the file never duplicates)
drop policy if exists "shared collections owner insert" on public.shared_collections;
create policy "shared collections owner insert" on public.shared_collections
  for insert with check (auth.uid() = owner_id);

drop policy if exists "shared collections owner update" on public.shared_collections;
create policy "shared collections owner update" on public.shared_collections
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "shared collections owner delete" on public.shared_collections;
create policy "shared collections owner delete" on public.shared_collections
  for delete using (auth.uid() = owner_id);
