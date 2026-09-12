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
-- RLS (v0.29.0 — NEW-DATA-14 hardening):
--   SELECT  → the OWNER reads their own rows from the base table;
--             everyone else (anon included) reads the
--             shared_wall_public VIEW, which exposes id / name /
--             description / items / owner_name / owner_avatar but NOT
--             owner_id. The old «for select using (true)» let any
--             anonymous visitor harvest every publisher's auth UUID
--             (and then their name/avatar from cinema_profiles with a
--             disposable account) — that leak is closed.
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

-- v0.29.0 (NEW-DATA-14) — the wall card shows the publisher's avatar without
-- any client-side join onto cinema_profiles: the snapshot rides the row.
alter table public.shared_collections add column if not exists owner_avatar text not null default '';

-- ---------- Row Level Security ----------
alter table public.shared_collections enable row level security;

-- v0.29.0 — the base table is NO LONGER world-readable. Anon visitors get the
-- projection view below; the owner still reads their own rows (badges,
-- unshare).
drop policy if exists "shared collections public read" on public.shared_collections;
drop policy if exists "shared collections owner read" on public.shared_collections;
-- v0.29.1 - the LIVE database named these policies with UNDERSCORES, so the
-- spaced drops above never matched and the world-readable policy survived
-- the v0.29.0 hardening (confirmed live via a pg_policies dump). Drop BOTH
-- spellings plus the redundant FOR ALL owner policy.
drop policy if exists "shared_collections_public_read" on public.shared_collections;
drop policy if exists "shared_collections_owner_all"   on public.shared_collections;
create policy "shared collections owner read" on public.shared_collections
  for select to authenticated
  using (auth.uid() = owner_id);

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

-- ---------- the PUBLIC projection (no owner_id) ----------
-- security_invoker = false → the view runs with the OWNER's rights, so it can
-- read the RLS-locked base table on behalf of anon visitors while exposing
-- only the safe columns. Re-run safe: create-or-replace.
create or replace view public.shared_wall_public
with (security_invoker = false) as
select
  id,
  owner_name,
  owner_avatar,
  name,
  description,
  items,
  item_count,
  created_at,
  updated_at
from public.shared_collections;

grant select on public.shared_wall_public to anon, authenticated;
