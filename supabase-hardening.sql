-- ============================================================================
-- Frame x Supabase - SECURITY HARDENING v2 (v0.29.1)
-- Run in Supabase SQL Editor. Idempotent: safe to re-run any number of times.
--
-- WHAT THIS FIXES (all confirmed live via a full pg_policies/grants dump):
--   1. shared_collections was still world-readable: the live policy was named
--      "shared_collections_public_read" (underscores) while the v0.29.0 file
--      only dropped the spaced spelling -> the drop never matched and any
--      anonymous visitor could harvest every publisher's auth uuid.
--   2. shared_wall_public is an auto-updatable, security_invoker=false view
--      owned by postgres (which bypasses RLS). Wide GRANT ALL leftovers gave
--      anon INSERT/UPDATE/DELETE on the view -> anonymous tamper/delete of
--      any wall row. The view must be SELECT-only for clients.
--   3. cinema_profiles was readable by ANY authenticated account (harvesting
--      oracle). Now own-row only; cross-user identity lookups go through the
--      scoped cinema_member_profiles RPC (cannot list, explicit ids, cap 30).
--   4. activate_code(): two DIFFERENT codes redeemed in parallel by the same
--      user could both read the same cur_exp -> one extension lost. The
--      entitlement row is now locked FOR UPDATE (the code row already was).
--   5. Hygiene: no client needs TRUNCATE/REFERENCES/TRIGGER; subscription
--      codes stay fully locked (RPC is the only door).
--
-- Run order: any time, after the other supabase-*.sql files.
-- ============================================================================

-- ---------------------------------------------------------------- 1) wall ---
drop policy if exists "shared_collections_public_read" on public.shared_collections;
drop policy if exists "shared collections public read" on public.shared_collections;
drop policy if exists "shared_collections_owner_all"   on public.shared_collections;

-- owner-only read on the base table (idempotent recreate)
drop policy if exists "shared collections owner read" on public.shared_collections;
create policy "shared collections owner read" on public.shared_collections
  for select to authenticated
  using (auth.uid() = owner_id);

-- the public projection: SELECT-only (kills anonymous tamper/delete via the
-- auto-updatable view; anon wall browsing keeps working through SELECT)
revoke all on public.shared_wall_public from anon, authenticated;
grant select on public.shared_wall_public to anon, authenticated;

-- ------------------------------------------------------------ 2) cinema ----
-- own-row only on the base table
drop policy if exists "cinema profiles read" on public.cinema_profiles;
create policy "cinema profiles read" on public.cinema_profiles
  for select to authenticated
  using (auth.uid() = user_id);

-- scoped identity lookup for member lists (see supabase-cinema.sql)
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

-- --------------------------------------------------------- 3) VIP codes ----
-- v2 of the redemption RPC: locks the subscriptions row too (stacking race).
create or replace function public.activate_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  c        record;
  cur_plan text;
  cur_exp  timestamptz;
  base     timestamptz;
  new_exp  timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  select * into c
  from public.subscription_codes
  where code = upper(btrim(p_code))
  for update;

  if not found then
    raise exception 'code_not_found';
  end if;

  if c.status <> 'unused' then
    raise exception 'code_already_used';
  end if;

  update public.subscription_codes
     set status = 'used', used_by = auth.uid(), used_at = now()
   where code = c.code;

  -- v0.29.1: lock the entitlement row - parallel redemptions of two
  -- DIFFERENT codes by one user must not lose an extension.
  select plan, expires_at into cur_plan, cur_exp
  from public.subscriptions
  where user_id = auth.uid()
  for update;

  if found and cur_exp is null then
    update public.subscriptions set updated_at = now() where user_id = auth.uid();
    return json_build_object('plan', cur_plan, 'expires_at', null);
  end if;

  if c.duration_days is null then
    insert into public.subscriptions (user_id, plan, expires_at, updated_at)
    values (auth.uid(), 'life', null, now())
    on conflict (user_id) do update
      set plan = 'life', expires_at = null, updated_at = now();
    return json_build_object('plan', 'life', 'expires_at', null);
  end if;

  base := case when cur_exp is not null and cur_exp > now() then cur_exp else now() end;
  new_exp := base + make_interval(days => c.duration_days);

  insert into public.subscriptions (user_id, plan, expires_at, updated_at)
  values (auth.uid(), c.plan, new_exp, now())
  on conflict (user_id) do update
    set plan = excluded.plan, expires_at = excluded.expires_at, updated_at = now();

  return json_build_object('plan', c.plan, 'expires_at', new_exp);
end;
$fn$;

revoke execute on function public.activate_code(text) from anon, public;
grant  execute on function public.activate_code(text) to authenticated;

-- codes stay fully locked for clients (the RPC is the only door)
revoke all on public.subscription_codes from anon, authenticated;

-- ------------------------------------------------------- 4) grant hygiene --
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------- verify ----
-- (a) every remaining policy on shared_collections/cinema_profiles must be
--     owner-scoped - expect NO row with qual = true
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('shared_collections', 'cinema_profiles')
order by tablename, policyname;

-- (b) the wall view must expose ONLY select for clients
select grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public' and table_name = 'shared_wall_public'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;

-- (c) both RPCs must exist and be definer-executable by authenticated
select proname, prosecdef as security_definer
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('activate_code', 'cinema_member_profiles');
