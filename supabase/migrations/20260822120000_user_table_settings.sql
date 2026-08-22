-- Per-user table layout settings (column width/order/visibility + page size).
-- v1 consumer: PROCUREMENT_PLANNER desktop table.

select pg_advisory_xact_lock(2026082212);

create table if not exists public.user_table_settings (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  table_name text not null,
  page_size integer not null default 25,
  columns jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_table_settings_auth_user_table_unique unique (auth_user_id, table_name),
  constraint user_table_settings_page_size_positive check (page_size > 0)
);

create index if not exists idx_user_table_settings_auth_user_id
  on public.user_table_settings (auth_user_id);

create index if not exists idx_user_table_settings_table_name
  on public.user_table_settings (table_name);

drop trigger if exists user_table_settings_updated_at on public.user_table_settings;
create trigger user_table_settings_updated_at
  before update on public.user_table_settings
  for each row execute function public.academy_set_updated_at();

alter table public.user_table_settings enable row level security;

drop policy if exists user_table_settings_select_own on public.user_table_settings;
create policy user_table_settings_select_own
  on public.user_table_settings
  for select
  to authenticated
  using (auth.uid() is not null and auth_user_id = auth.uid());

drop policy if exists user_table_settings_insert_own on public.user_table_settings;
create policy user_table_settings_insert_own
  on public.user_table_settings
  for insert
  to authenticated
  with check (auth.uid() is not null and auth_user_id = auth.uid());

drop policy if exists user_table_settings_update_own on public.user_table_settings;
create policy user_table_settings_update_own
  on public.user_table_settings
  for update
  to authenticated
  using (auth.uid() is not null and auth_user_id = auth.uid())
  with check (auth.uid() is not null and auth_user_id = auth.uid());

drop policy if exists user_table_settings_delete_own on public.user_table_settings;
create policy user_table_settings_delete_own
  on public.user_table_settings
  for delete
  to authenticated
  using (auth.uid() is not null and auth_user_id = auth.uid());

revoke all on table public.user_table_settings from anon;
revoke all on table public.user_table_settings from authenticated;

grant select, insert, update, delete
  on table public.user_table_settings
  to authenticated;

grant all privileges on table public.user_table_settings to service_role;
