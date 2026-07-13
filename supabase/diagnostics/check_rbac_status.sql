-- DEPRECATED: do not execute. Use 20260712163000_complete_flexible_rbac.sql
-- Read-only diagnostic script for RBAC status in Supabase.
-- Run manually in SQL Editor when verifying migration deployment.

-- ---------------------------------------------------------------------------
-- 1. Core tables
-- ---------------------------------------------------------------------------
SELECT 'roles' AS object, to_regclass('public.roles') IS NOT NULL AS exists
UNION ALL
SELECT 'permissions', to_regclass('public.permissions') IS NOT NULL
UNION ALL
SELECT 'role_permissions', to_regclass('public.role_permissions') IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Counts (safe when tables missing)
-- ---------------------------------------------------------------------------
SELECT
  CASE WHEN to_regclass('public.roles') IS NOT NULL
    THEN (SELECT count(*)::bigint FROM public.roles)
    ELSE NULL END AS roles_count,
  CASE WHEN to_regclass('public.permissions') IS NOT NULL
    THEN (SELECT count(*)::bigint FROM public.permissions)
    ELSE NULL END AS permissions_count,
  CASE WHEN to_regclass('public.role_permissions') IS NOT NULL
    THEN (SELECT count(*)::bigint FROM public.role_permissions)
    ELSE NULL END AS role_permissions_count;

-- ---------------------------------------------------------------------------
-- 3. Employee role codes vs roles table (requires academy_users)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.academy_users') IS NULL THEN
    RAISE NOTICE 'academy_users table not found';
    RETURN;
  END IF;
END $$;

SELECT
  au.role AS employee_role_code,
  count(*) AS employees
FROM public.academy_users au
WHERE au.role IS NOT NULL AND btrim(au.role) <> ''
GROUP BY au.role
ORDER BY employees DESC, employee_role_code;

-- Missing mappings (skip if roles table absent)
SELECT au.role AS missing_role_code, count(*) AS employees
FROM public.academy_users au
LEFT JOIN public.roles r ON r.code = au.role
WHERE to_regclass('public.roles') IS NOT NULL
  AND au.role IS NOT NULL
  AND btrim(au.role) <> ''
  AND r.id IS NULL
GROUP BY au.role
ORDER BY employees DESC;

-- ---------------------------------------------------------------------------
-- 4. RPC functions
-- ---------------------------------------------------------------------------
SELECT
  p.proname AS rpc_name,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'rbac_%'
ORDER BY p.proname;

-- ---------------------------------------------------------------------------
-- 5. RLS state
-- ---------------------------------------------------------------------------
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('roles', 'permissions', 'role_permissions')
ORDER BY c.relname;

-- ---------------------------------------------------------------------------
-- 6. Legacy platform_* tables (optional)
-- ---------------------------------------------------------------------------
SELECT 'platform_roles' AS legacy_table, to_regclass('public.platform_roles') IS NOT NULL AS exists
UNION ALL
SELECT 'platform_permissions', to_regclass('public.platform_permissions') IS NOT NULL
UNION ALL
SELECT 'platform_role_permissions', to_regclass('public.platform_role_permissions') IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. Sample role permission counts (requires roles)
-- ---------------------------------------------------------------------------
SELECT
  r.code,
  r.name,
  r.is_active,
  count(rp.permission_id) AS permission_count,
  (
    SELECT count(*)
    FROM public.academy_users au
    WHERE au.role = r.code OR au.role_id = r.id
  ) AS employee_count
FROM public.roles r
LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
WHERE to_regclass('public.roles') IS NOT NULL
GROUP BY r.id, r.code, r.name, r.is_active
ORDER BY r.code;
