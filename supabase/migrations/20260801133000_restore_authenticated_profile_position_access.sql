-- Hotfix 2.1: restore authenticated own-profile SELECT on academy_users.position_id
-- Root cause: Phase 2 auth cutover used column-level GRANT SELECT (...).
-- Stage 1 added position_id without extending that grant. Selecting it returns
-- "permission denied for table academy_users" (42501) after Auth 200.

select pg_advisory_xact_lock(202608011330);

do $$
begin
  if to_regclass('public.academy_users') is null then
    raise exception 'hotfix 2.1 precondition failed: public.academy_users missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'academy_users'
      and column_name = 'position_id'
  ) then
    raise exception 'hotfix 2.1 precondition failed: academy_users.position_id missing';
  end if;
end $$;

-- Minimal additive grant: only the new safe profile column.
-- Does not grant table-wide SELECT, UPDATE/INSERT/DELETE, or anon access.
grant select (position_id) on table public.academy_users to authenticated;

comment on column public.academy_users.position_id is
  'FK to public.positions. Nullable during Stage 1 coexistence with legacy text column academy_users.position. Authenticated users may SELECT their own row value via RLS; writes remain Edge/service_role.';

do $$
begin
  if not has_column_privilege('authenticated', 'public.academy_users', 'position_id', 'SELECT') then
    raise exception 'hotfix 2.1 postcheck failed: authenticated still lacks SELECT on academy_users.position_id';
  end if;

  if has_column_privilege('anon', 'public.academy_users', 'position_id', 'SELECT') then
    raise exception 'hotfix 2.1 postcheck failed: anon must not SELECT academy_users.position_id';
  end if;

  if has_column_privilege('authenticated', 'public.academy_users', 'password', 'SELECT') then
    raise exception 'hotfix 2.1 postcheck failed: authenticated must not SELECT password';
  end if;

  if has_table_privilege('anon', 'public.academy_users', 'SELECT') then
    raise exception 'hotfix 2.1 postcheck failed: anon must not have table SELECT on academy_users';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'academy_users'
      and policyname = 'academy_users_select_own_profile'
      and cmd = 'SELECT'
  ) then
    raise exception 'hotfix 2.1 postcheck failed: own-profile SELECT policy missing';
  end if;
end $$;
