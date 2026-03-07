create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'activity_type') then
    create type public.activity_type as enum ('meeting', 'email', 'file', 'deck', 'spreadsheet', 'web_search');
  end if;

  if not exists (select 1 from pg_type where typname = 'ai_action_type') then
    create type public.ai_action_type as enum ('summary', 'draft', 'search', 'deck', 'analysis');
  end if;

  if not exists (select 1 from pg_type where typname = 'plan_tier') then
    create type public.plan_tier as enum ('free', 'starter', 'pro', 'business', 'enterprise');
  end if;
end $$;

create table if not exists public.activity_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.activity_type not null,
  source_id text not null,
  title text not null,
  summary text not null default '',
  action_items jsonb not null default '[]'::jsonb,
  decisions jsonb not null default '[]'::jsonb,
  links jsonb not null default '{}'::jsonb,
  model_used text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_activity_items_user_id_created_at
  on public.activity_items(user_id, created_at desc);

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type public.ai_action_type not null,
  model_used text not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_user_id_created_at
  on public.ai_usage(user_id, created_at desc);

create table if not exists public.user_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  tier public.plan_tier not null default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  status text not null default 'active',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_plans_user_id
  on public.user_plans(user_id);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_activity_items_updated_at on public.activity_items;
create trigger trg_activity_items_updated_at
before update on public.activity_items
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_user_plans_updated_at on public.user_plans;
create trigger trg_user_plans_updated_at
before update on public.user_plans
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.activity_items enable row level security;
alter table public.ai_usage enable row level security;
alter table public.user_plans enable row level security;

drop policy if exists "activity_items_select_own" on public.activity_items;
create policy "activity_items_select_own"
on public.activity_items
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "activity_items_insert_own" on public.activity_items;
create policy "activity_items_insert_own"
on public.activity_items
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "activity_items_update_own" on public.activity_items;
create policy "activity_items_update_own"
on public.activity_items
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own"
on public.ai_usage
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "ai_usage_insert_own" on public.ai_usage;
create policy "ai_usage_insert_own"
on public.ai_usage
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_plans_select_own" on public.user_plans;
create policy "user_plans_select_own"
on public.user_plans
for select
to authenticated
using (auth.uid() = user_id);
