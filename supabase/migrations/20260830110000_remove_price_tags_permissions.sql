-- ---------------------------------------------------------------------------
-- Owner decision (2026-08-30): the «Печать ценников» (Price Tags) feature was
-- removed from the codebase in commit 9e8fb5c (route, page, components,
-- utils, nav group, permissionCatalog entries). That commit deliberately did
-- not touch already-applied migrations — this migration is the follow-up
-- that retires the now-unreachable price_tags.view / price_tags.manage
-- permission codes from the database, so no orphaned rows are left behind.
--
-- Seeded by (still present in these historical files, left untouched):
--   add_rbac_flexible_v2.sql, add_rbac_system.sql,
--   20260712163000_complete_flexible_rbac.sql
--
-- Scope: only the two permission codes below and their role_permissions
-- grants. No tables, no other permission codes, no role/employee data.
--
-- Fail-closed: short lock/statement timeouts, an exact preflight that both
-- codes exist, explicit child-before-parent deletes (role_permissions before
-- permissions, not left to ON DELETE CASCADE), and an exact postcheck that
-- both codes are gone.
-- ---------------------------------------------------------------------------

set lock_timeout = '5s';
set statement_timeout = '30s';

select pg_advisory_xact_lock(202608301100);

do $$
declare
  v_target_permissions text[] := array[
    'price_tags.view',
    'price_tags.manage'
  ];
  v_found_permissions integer;
  v_role_permissions_deleted integer;
  v_permissions_deleted integer;
  v_remaining_permissions integer;
begin
  -- -----------------------------------------------------------------------
  -- Preflight: the two permission codes exist, exactly.
  -- -----------------------------------------------------------------------
  select count(*) into v_found_permissions
  from public.permissions
  where code = any(v_target_permissions);

  if v_found_permissions <> array_length(v_target_permissions, 1) then
    raise exception
      'Preflight failed: expected % target permission code(s), found % — aborting to avoid deleting an unrelated or already-changed set',
      array_length(v_target_permissions, 1), v_found_permissions;
  end if;

  raise notice 'Preflight passed: % target permission(s) found', v_found_permissions;

  -- -----------------------------------------------------------------------
  -- Delete: role_permissions (child) before permissions (parent). Explicit,
  -- not left to ON DELETE CASCADE.
  -- -----------------------------------------------------------------------
  delete from public.role_permissions rp
  using public.permissions p
  where rp.permission_id = p.id
    and p.code = any(v_target_permissions);

  get diagnostics v_role_permissions_deleted = row_count;

  delete from public.permissions
  where code = any(v_target_permissions);

  get diagnostics v_permissions_deleted = row_count;

  raise notice 'Deleted % role_permissions row(s) and % permissions row(s)',
    v_role_permissions_deleted, v_permissions_deleted;

  -- -----------------------------------------------------------------------
  -- Postcheck: exactly the two permissions are gone.
  -- -----------------------------------------------------------------------
  select count(*) into v_remaining_permissions
  from public.permissions
  where code = any(v_target_permissions);

  if v_remaining_permissions <> 0 then
    raise exception
      'Postcheck failed: % target permission(s) still present', v_remaining_permissions;
  end if;

  raise notice 'Postcheck passed: 0 target permissions remain';
end;
$$;
