-- ---------------------------------------------------------------------------
-- Owner decision (2026-08-12): permanently remove two unused features.
--
--   1. Price Checker (products.price_checker.view) — UMAG barcode lookup
--      prototype under Products. The Edge Function source and frontend are
--      removed in the same PR; the deployed remote Edge Function
--      `umag-price-check` (ACTIVE, version 22) must be deleted separately
--      as a manual post-deploy step (this migration does not reach it).
--
--   2. Standards knowledge base (standards.view, standards.manage) — the
--      whole module: management UI, article/category data and the
--      per-user read/acknowledgement log.
--
-- As audited 2026-08-12, production holds:
--   academy_standard_article_reads  — 11 rows
--   academy_standard_articles       — 12 rows
--   academy_standard_categories     — 0 rows
--   role_permissions: 1 role on products.price_checker.view,
--                      1 role on standards.manage, 5 roles on standards.view
--
-- This migration deletes exactly those three tables' data (by dropping the
-- tables) and the role_permissions/permissions rows for the three codes
-- above. Nothing else. It does NOT touch:
--   - public.academy_users, employee roles, or any other RBAC role/permission
--   - public.academy_set_updated_at() — shared trigger function, still used
--     by other tables
--   - any historical migration file
--
-- Deleted user data (article content, read/acknowledgement history) has no
-- meaningful rollback here: restoring it means restoring from a pre-migration
-- database backup, not a scripted "down" migration that fabricates rows back
-- into existence. None is provided.
--
-- Fail-closed: short lock/statement timeouts, an exact preflight for the
-- three target tables + three target permission codes, a check for
-- unexpected inbound foreign keys into the tables we are about to drop,
-- explicit child-to-parent drops (no CASCADE), and an exact postcheck that
-- all three permissions and all three tables are gone.
-- ---------------------------------------------------------------------------

set lock_timeout = '5s';
set statement_timeout = '30s';

select pg_advisory_xact_lock(202608120951);

do $$
declare
  v_target_permissions text[] := array[
    'products.price_checker.view',
    'standards.view',
    'standards.manage'
  ];
  v_target_tables text[] := array[
    'academy_standard_article_reads',
    'academy_standard_articles',
    'academy_standard_categories'
  ];
  v_found_permissions integer;
  v_missing_tables text[];
  v_unexpected_fk integer;
  v_role_permissions_deleted integer;
  v_permissions_deleted integer;
  v_remaining_permissions integer;
  v_remaining_tables integer;
begin
  -- -----------------------------------------------------------------------
  -- Preflight 1: the three permission codes exist, exactly.
  -- -----------------------------------------------------------------------
  select count(*) into v_found_permissions
  from public.permissions
  where code = any(v_target_permissions);

  if v_found_permissions <> array_length(v_target_permissions, 1) then
    raise exception
      'Preflight failed: expected % target permission code(s), found % — aborting to avoid deleting an unrelated or already-changed set',
      array_length(v_target_permissions, 1), v_found_permissions;
  end if;

  -- -----------------------------------------------------------------------
  -- Preflight 2: the three tables exist, exactly.
  -- -----------------------------------------------------------------------
  select array_agg(t) into v_missing_tables
  from unnest(v_target_tables) as t
  where to_regclass('public.' || t) is null;

  if v_missing_tables is not null then
    raise exception 'Preflight failed: missing target table(s): %', v_missing_tables;
  end if;

  -- -----------------------------------------------------------------------
  -- Preflight 3: no unexpected inbound FK into the tables we are about to
  -- drop, other than the two we already know about and are dropping
  -- ourselves (articles -> categories, reads -> articles).
  -- -----------------------------------------------------------------------
  select count(*) into v_unexpected_fk
  from pg_constraint con
  join pg_class src on src.oid = con.conrelid
  join pg_namespace nsrc on nsrc.oid = src.relnamespace and nsrc.nspname = 'public'
  join pg_class tgt on tgt.oid = con.confrelid
  join pg_namespace ntgt on ntgt.oid = tgt.relnamespace and ntgt.nspname = 'public'
  where con.contype = 'f'
    and tgt.relname = any(v_target_tables)
    and src.relname <> all(v_target_tables);

  if v_unexpected_fk > 0 then
    raise exception
      'Preflight failed: % unexpected inbound foreign key(s) reference the standards tables from outside the standards module — aborting',
      v_unexpected_fk;
  end if;

  raise notice 'Preflight passed: % target permission(s), % target table(s), 0 unexpected FK(s)',
    v_found_permissions, array_length(v_target_tables, 1);

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
  -- Drop tables, child to parent, no CASCADE. Indexes / triggers / RLS
  -- policies on each table drop with it. academy_set_updated_at() is not
  -- touched — it is shared with other tables.
  -- -----------------------------------------------------------------------
  drop table if exists public.academy_standard_article_reads;
  drop table if exists public.academy_standard_articles;
  drop table if exists public.academy_standard_categories;

  -- -----------------------------------------------------------------------
  -- Postcheck: exactly the three permissions and three tables are gone.
  -- -----------------------------------------------------------------------
  select count(*) into v_remaining_permissions
  from public.permissions
  where code = any(v_target_permissions);

  if v_remaining_permissions <> 0 then
    raise exception
      'Postcheck failed: % target permission(s) still present', v_remaining_permissions;
  end if;

  select count(*) into v_remaining_tables
  from unnest(v_target_tables) as t
  where to_regclass('public.' || t) is not null;

  if v_remaining_tables <> 0 then
    raise exception
      'Postcheck failed: % target table(s) still present', v_remaining_tables;
  end if;

  if to_regprocedure('public.academy_set_updated_at()') is null then
    raise exception 'Postcheck failed: academy_set_updated_at() was removed — it is shared and must survive';
  end if;

  raise notice 'Postcheck passed: 0 target permissions remain, 0 target tables remain, shared trigger function intact';
end;
$$;
