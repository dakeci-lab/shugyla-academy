-- Phase 2 production rollback — policies/grants ONLY
-- DO NOT RUN unless critical production outage after Phase 2 cutover.
-- DO NOT add to supabase/migrations/ (manual emergency use only).
--
-- Restores pre-Phase-2 legacy anon/authenticated grants and permissive policies
-- captured from production before 20260714210000 apply (Step 22O).
-- Does NOT: touch auth.users, auth_user_id, passwords, Edge Functions, notifications.

begin;

-- ---------------------------------------------------------------------------
-- 1. Remove Phase 2 policies (if present)
-- ---------------------------------------------------------------------------

drop policy if exists academy_users_select_own_profile on public.academy_users;
drop policy if exists academy_employee_shifts_select_own on public.academy_employee_shifts;
drop policy if exists academy_course_assignments_select_own on public.academy_course_assignments;

-- ---------------------------------------------------------------------------
-- 2. academy_users — restore legacy permissive access
-- ---------------------------------------------------------------------------

revoke all on table public.academy_users from authenticated;
revoke all on table public.academy_users from anon;

grant all on table public.academy_users to anon;
grant all on table public.academy_users to authenticated;

drop policy if exists "Allow anon read write academy_users" on public.academy_users;
create policy "Allow anon read write academy_users"
  on public.academy_users
  for all
  to public
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 3. academy_employee_shifts — restore legacy permissive access
-- ---------------------------------------------------------------------------

revoke all on table public.academy_employee_shifts from authenticated;
revoke all on table public.academy_employee_shifts from anon;

grant all on table public.academy_employee_shifts to anon;
grant all on table public.academy_employee_shifts to authenticated;

drop policy if exists "Allow anon read write academy_employee_shifts" on public.academy_employee_shifts;
create policy "Allow anon read write academy_employee_shifts"
  on public.academy_employee_shifts
  for all
  to public
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 4. RBAC catalog — restore pre-Phase-2 grants (SELECT policies unchanged)
-- ---------------------------------------------------------------------------

revoke all on table public.roles from authenticated;
revoke all on table public.permissions from authenticated;
revoke all on table public.role_permissions from authenticated;

grant all on table public.roles to anon;
grant all on table public.permissions to anon;
grant all on table public.role_permissions to anon;
grant all on table public.roles to authenticated;
grant all on table public.permissions to authenticated;
grant all on table public.role_permissions to authenticated;

-- auth_private helper grants from Phase 2 may remain (harmless); do not revoke service_role.

notify pgrst, 'reload schema';

-- After manual apply, repair migration history if needed:
--   supabase migration repair --status reverted 20260714210000 --linked

commit;
