-- ============================================================================
-- Frame — Subscription / VIP (run in Supabase SQL Editor, once)
-- Pairs with supabase-setup.sql (auth + favorites/watchlist/ratings/user_events)
--
-- Model:
--   subscription_codes : pre-generated codes YOU hand to customers
--                        (NOT readable by users — they can only "spend" one
--                        blindly through the activate_code() function)
--   subscriptions      : one row per user = their current entitlement
--                        (users can SELECT only their own row; writes happen
--                        exclusively inside the SECURITY DEFINER function)
--
-- After running this file, run frame-vip-codes.sql (the code batch) too.
-- ============================================================================

-- ---------------------------------------------------------------- codes ----
create table if not exists public.subscription_codes (
  code           text primary key,
  plan           text not null check (plan in ('m1','m3','m6','y1','life')),
  duration_days  int,                    -- null = lifetime
  status         text not null default 'unused' check (status in ('unused','used')),
  used_by        uuid references auth.users(id) on delete set null,
  used_at        timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.subscription_codes enable row level security;

-- intentionally NO policies: anon/authenticated can neither list nor insert
-- codes; the definer function below is the only door.

-- -------------------------------------------------------- subscriptions ----
create table if not exists public.subscriptions (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  plan        text not null,
  expires_at  timestamptz,               -- null = lifetime
  updated_at  timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "own subscription read" on public.subscriptions;
create policy "own subscription read"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- no insert/update/delete policies on purpose: only activate_code() writes.

-- ---------------------------------------------------- activate_code RPC ----
-- Atomically: validate code -> mark used -> extend the user's subscription.
-- Extending stacks onto the remaining time of the current subscription.
create or replace function public.activate_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
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

  select plan, expires_at into cur_plan, cur_exp
  from public.subscriptions
  where user_id = auth.uid();

  -- already lifetime → nothing can extend it further
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
$$;

revoke execute on function public.activate_code(text) from anon, public;
grant  execute on function public.activate_code(text) to authenticated;
