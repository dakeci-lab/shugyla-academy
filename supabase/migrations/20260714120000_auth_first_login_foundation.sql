-- Auth-first login foundation (local development; apply to production in a later step)
-- Depends on: schema.sql, complete_flexible_rbac, notification_system_foundation

-- ---------------------------------------------------------------------------
-- 1. Private schema for auth RLS helpers (separate from notification_private)
-- ---------------------------------------------------------------------------

create schema if not exists auth_private;

revoke all on schema auth_private from public;
revoke all on schema auth_private from anon;
revoke all on schema auth_private from authenticated;

grant usage on schema auth_private to authenticated;
grant usage on schema auth_private to service_role;

-- ---------------------------------------------------------------------------
-- 2. Ownership helper — SECURITY DEFINER, no data returned
-- ---------------------------------------------------------------------------

create or replace function auth_private.employee_owned_by_current_auth(
  p_employee_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_employee_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.academy_users as au
      where au.id = p_employee_id
        and au.auth_user_id = auth.uid()
    );
$$;

comment on function auth_private.employee_owned_by_current_auth(bigint) is
  'Returns true when p_employee_id belongs to the current Supabase Auth user (auth.uid()). Used by RLS on academy_course_assignments.';

revoke all on function auth_private.employee_owned_by_current_auth(bigint) from public;
revoke all on function auth_private.employee_owned_by_current_auth(bigint) from anon;
revoke all on function auth_private.employee_owned_by_current_auth(bigint) from authenticated;

grant execute on function auth_private.employee_owned_by_current_auth(bigint) to authenticated;
grant execute on function auth_private.employee_owned_by_current_auth(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 3. academy_users — remove permissive policy, own-profile only
-- ---------------------------------------------------------------------------

drop policy if exists "Allow anon read write academy_users" on public.academy_users;

alter table public.academy_users enable row level security;

revoke all on table public.academy_users from anon;
revoke all on table public.academy_users from authenticated;

grant select (
  id,
  first_name,
  last_name,
  full_name,
  login,
  role,
  role_id,
  status,
  position,
  avatar_url,
  created_at,
  updated_at,
  auth_user_id
) on table public.academy_users to authenticated;

drop policy if exists academy_users_select_own_profile on public.academy_users;
create policy academy_users_select_own_profile
  on public.academy_users
  for select
  to authenticated
  using (
    auth.uid() is not null
    and auth_user_id = auth.uid()
  );

grant all on table public.academy_users to service_role;

-- ---------------------------------------------------------------------------
-- 4. academy_course_assignments — own assignments only after Auth
-- ---------------------------------------------------------------------------

alter table public.academy_course_assignments enable row level security;

revoke all on table public.academy_course_assignments from anon;
revoke all on table public.academy_course_assignments from authenticated;

grant select on table public.academy_course_assignments to authenticated;

drop policy if exists academy_course_assignments_select_own on public.academy_course_assignments;
create policy academy_course_assignments_select_own
  on public.academy_course_assignments
  for select
  to authenticated
  using (auth_private.employee_owned_by_current_auth(user_id));

grant all on table public.academy_course_assignments to service_role;

-- ---------------------------------------------------------------------------
-- 5. RBAC catalog — authenticated read-only for permission resolution after login
-- ---------------------------------------------------------------------------

revoke all on table public.roles from anon;
revoke all on table public.permissions from anon;
revoke all on table public.role_permissions from anon;

revoke all on table public.roles from authenticated;
revoke all on table public.permissions from authenticated;
revoke all on table public.role_permissions from authenticated;

grant select on table public.roles to authenticated;
grant select on table public.permissions to authenticated;
grant select on table public.role_permissions to authenticated;

notify pgrst, 'reload schema';
