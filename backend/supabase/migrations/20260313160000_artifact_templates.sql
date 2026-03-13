create table if not exists public.artifact_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('word', 'excel', 'powerpoint')),
  name text not null,
  mime_type text not null default 'text/plain',
  template_content text not null,
  placeholders jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_artifact_templates_kind_updated
  on public.artifact_templates(kind, updated_at desc);

create index if not exists idx_artifact_templates_user_kind_updated
  on public.artifact_templates(user_id, kind, updated_at desc);

drop trigger if exists trg_artifact_templates_updated_at on public.artifact_templates;
create trigger trg_artifact_templates_updated_at
before update on public.artifact_templates
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.artifact_templates enable row level security;

drop policy if exists "artifact_templates_select_own_or_global" on public.artifact_templates;
create policy "artifact_templates_select_own_or_global"
on public.artifact_templates
for select
to authenticated
using (user_id is null or auth.uid() = user_id);

drop policy if exists "artifact_templates_insert_own" on public.artifact_templates;
create policy "artifact_templates_insert_own"
on public.artifact_templates
for insert
to authenticated
with check (user_id is null or auth.uid() = user_id);

drop policy if exists "artifact_templates_update_own" on public.artifact_templates;
create policy "artifact_templates_update_own"
on public.artifact_templates
for update
to authenticated
using (user_id is null or auth.uid() = user_id)
with check (user_id is null or auth.uid() = user_id);
