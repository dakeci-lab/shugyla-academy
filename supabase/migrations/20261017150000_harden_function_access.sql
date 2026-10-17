-- Stage 15a: function access hardening (applied on prod 2026-10-17 via MCP as `harden_function_access`).
--
-- Supabase security advisor findings:
--  * the procurement scheduler entry points were callable by anon/authenticated through /rest/v1/rpc
--    (anyone could trigger the UMAG sync / snapshot archive) — they are for pg_cron only (runs as postgres);
--  * the role-management RPCs (rbac_*) were executable by anon — signed-in admins only (they also check
--    permissions inside);
--  * two functions of the removed attendance module had no callers;
--  * utility functions without a fixed search_path.
--
-- Rollback: grant execute on the functions back to the roles listed in the revokes below.

select pg_advisory_xact_lock(202610171001);

revoke execute on function public.invoke_procurement_archive_scheduler() from public, anon, authenticated;
revoke execute on function public.invoke_procurement_sync_scheduler() from public, anon, authenticated;

revoke execute on function public.rbac_assert_admin_role_protected(uuid, uuid[]) from public, anon;
revoke execute on function public.rbac_assert_can_manage_roles() from public, anon;
revoke execute on function public.rbac_create_role(text, text, text, uuid[]) from public, anon;
revoke execute on function public.rbac_current_user_role_code() from public, anon;
revoke execute on function public.rbac_duplicate_role(uuid, text, text) from public, anon;
revoke execute on function public.rbac_save_role_permissions(uuid, uuid[]) from public, anon;
revoke execute on function public.rbac_set_role_active(uuid, boolean) from public, anon;
revoke execute on function public.rbac_update_role(uuid, text, text, boolean, uuid[]) from public, anon;

drop function public.platform_haversine_meters(numeric, numeric, numeric, numeric);
drop function public.platform_get_employee_work_location(bigint);

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname in (
            'set_platform_suppliers_updated_at', 'set_updated_at', 'academy_set_updated_at',
            'rbac_role_display_name', 'rbac_is_system_role', 'rbac_role_description',
            'rbac_grant_role_permissions', 'rbac_grant_role_permissions_if_empty'))
       or (n.nspname = 'auth_private' and p.proname = 'login_to_technical_email')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.fn);
  end loop;
end $$;
