-- Production Auth security cutover — Phase 2
-- RUN ONLY AFTER:
--   1) Phase 1 applied
--   2) All active academy_users linked via auth_user_id (provisioning complete)
--   3) Auth-first frontend + admin Edge Functions deployed and smoke-tested
--
-- Does NOT clear legacy password values (Phase 3).

select pg_advisory_xact_lock(202607142100);

-- ---------------------------------------------------------------------------
-- Preconditions
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'academy_users'
      and column_name = 'auth_user_id'
  ) then
    raise exception 'phase2 precondition failed: academy_users.auth_user_id column missing (apply Phase 1 first)';
  end if;

  if exists (
    select 1
    from public.academy_users
    where status = 'active'
      and auth_user_id is null
  ) then
    raise exception 'phase2 precondition failed: active academy_users without auth_user_id (complete provisioning first)';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. auth_private grants for authenticated (helpers created in Phase 1)
-- ---------------------------------------------------------------------------

grant usage on schema auth_private to authenticated;
grant usage on schema auth_private to service_role;

grant execute on function auth_private.employee_owned_by_current_auth(bigint) to authenticated;
grant execute on function auth_private.employee_owned_by_current_auth(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 2. academy_users — remove permissive access, own-profile only
-- ---------------------------------------------------------------------------

drop policy if exists "Allow anon read write academy_users" on public.academy_users;

alter table public.academy_users enable row level security;

revoke all on table public.academy_users from anon;
revoke all on table public.academy_users from authenticated;
revoke truncate on table public.academy_users from anon;

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
-- 3. academy_employee_shifts — remove permissive anon access
-- ---------------------------------------------------------------------------

drop policy if exists "Allow anon read write academy_employee_shifts" on public.academy_employee_shifts;

alter table public.academy_employee_shifts enable row level security;

revoke all on table public.academy_employee_shifts from anon;
revoke all on table public.academy_employee_shifts from authenticated;
revoke truncate on table public.academy_employee_shifts from anon;

grant select on table public.academy_employee_shifts to authenticated;

drop policy if exists academy_employee_shifts_select_own on public.academy_employee_shifts;
create policy academy_employee_shifts_select_own
  on public.academy_employee_shifts
  for select
  to authenticated
  using (auth_private.employee_owned_by_current_auth(employee_id));

grant all on table public.academy_employee_shifts to service_role;

-- ---------------------------------------------------------------------------
-- 4. academy_course_assignments — own assignments only
-- ---------------------------------------------------------------------------

alter table public.academy_course_assignments enable row level security;

revoke all on table public.academy_course_assignments from anon;
revoke all on table public.academy_course_assignments from authenticated;
revoke truncate on table public.academy_course_assignments from anon;

grant select on table public.academy_course_assignments to authenticated;

drop policy if exists academy_course_assignments_select_own on public.academy_course_assignments;
create policy academy_course_assignments_select_own
  on public.academy_course_assignments
  for select
  to authenticated
  using (auth_private.employee_owned_by_current_auth(user_id));

grant all on table public.academy_course_assignments to service_role;

-- ---------------------------------------------------------------------------
-- 5. RBAC catalog — authenticated read-only for permission resolution
-- ---------------------------------------------------------------------------

revoke all on table public.roles from anon;
revoke all on table public.permissions from anon;
revoke all on table public.role_permissions from anon;
revoke truncate on table public.roles from anon;
revoke truncate on table public.permissions from anon;
revoke truncate on table public.role_permissions from anon;

revoke all on table public.roles from authenticated;
revoke all on table public.permissions from authenticated;
revoke all on table public.role_permissions from authenticated;

grant select on table public.roles to authenticated;
grant select on table public.permissions to authenticated;
grant select on table public.role_permissions to authenticated;

notify pgrst, 'reload schema';
