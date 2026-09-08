-- ============================================================
-- Frame × Supabase — USER COLLECTIONS (one-time setup)
-- Where to run: Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Adds cloud sync for the user-created collections:
--   user_collections        (name + owner)
--   user_collection_items   (title rows inside a collection)
--
-- Row Level Security: every signed-in user can ONLY touch their own
-- collections. Anonymous users get nothing.
--
-- Run AFTER (or together with) supabase-setup.sql — it does not replace it.
-- ============================================================

create table if not exists public.user_collections (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.user_collection_items (
  id            uuid        primary key default gen_random_uuid(),
  collection_id uuid        not null references public.user_collections(id) on delete cascade,
  title_id      bigint      not null,
  added_at      timestamptz not null default now(),
  unique (collection_id, title_id)
);

create index if not exists user_collections_user_id_idx on public.user_collections (user_id);
create index if not exists user_collection_items_collection_id_idx on public.user_collection_items (collection_id);

-- ---------- Row Level Security ----------
alter table public.user_collections enable row level security;
alter table public.user_collection_items enable row level security;

-- owner-only access (drop+recreate so re-running the file never duplicates)
drop policy if exists "collections owner all" on public.user_collections;
create policy "collections owner all" on public.user_collections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "collection items owner all" on public.user_collection_items;
create policy "collection items owner all" on public.user_collection_items
  for all using (
    exists (select 1 from public.user_collections c where c.id = collection_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.user_collections c where c.id = collection_id and c.user_id = auth.uid())
  );
