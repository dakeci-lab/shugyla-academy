-- Production legacy password cleanup — Phase 3
-- HIGH RISK / DO NOT RUN YET
--
-- RUN ONLY AFTER:
--   1) Phase 2 applied and stable
--   2) Auth-first login verified for all active staff
--   3) Explicit owner approval for password cleanup
--
-- Clears plaintext password values only. Does NOT drop the column.

select pg_advisory_xact_lock(202607142200);

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'academy_users'
      and column_name = 'auth_user_id'
  ) then
    raise exception 'phase3 precondition failed: auth_user_id column missing';
  end if;

  if exists (
    select 1
    from public.academy_users
    where status = 'active'
      and auth_user_id is null
  ) then
    raise exception 'phase3 precondition failed: active academy_users without auth_user_id';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'academy_users'
      and policyname = 'Allow anon read write academy_users'
  ) then
    raise exception 'phase3 precondition failed: permissive anon policy still present (apply Phase 2 first)';
  end if;
end;
$$;

update public.academy_users
set password = ''
where password is not null
  and password <> '';

notify pgrst, 'reload schema';
