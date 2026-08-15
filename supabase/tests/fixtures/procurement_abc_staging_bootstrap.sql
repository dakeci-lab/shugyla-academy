-- =============================================================================
-- TEST-ONLY / empty disposable Supabase project only
-- =============================================================================
-- NOT a production migration. Do not copy this file into supabase/migrations/.
-- Do not apply to the live Shugyla platform. Do not copy production data.
-- Do not drop or alter leftover demo tables (public.snake_scores, public.snake_players).
--
-- Purpose: create the minimum prerequisite objects that the real procurement
-- planning migrations (20260809072915 … 20260815072607) expect, so ABC can be
-- exercised on an almost-empty disposable project without lifting the full
-- platform or cloning production.
--
-- Apply order (fixture first, then unchanged real migrations):
--   0. supabase/tests/fixtures/procurement_abc_staging_bootstrap.sql   (this file)
--   1. supabase/migrations/20260809072915_procurement_planning_v1.sql
--   2. supabase/migrations/20260809073454_procurement_planning_v1_hardening.sql
--   3. supabase/migrations/20260810160315_procurement_partial_supplier_generation.sql
--   4. supabase/migrations/20260810170350_require_supplier_for_procurement_generation.sql
--   5. supabase/migrations/20260812032500_fix_procurement_snapshot_guard_security_definer.sql
--   6. supabase/migrations/20260812041000_procurement_order_state_rpc.sql
--   7. supabase/migrations/20260812054623_revoke_procurement_snapshot_guard_execute.sql
--   8. supabase/migrations/20260812171700_procurement_norm_taxonomy_rpc.sql
--   9. supabase/migrations/20260814134910_procurement_repeat_analytics_orders.sql
--  10. supabase/migrations/20260815072607_procurement_abc_analysis.sql
--  11. supabase/migrations/20260815095402_secure_platform_suppliers_rls.sql
--
-- Skipped on purpose (same date window, not required by the planning chain):
--   receiving UMAG v1, recruitment, roles, finance, indexes on academy_*.
--   Columns that 20260814134910 GRANTs (unit, receiving export fields, …) are
--   created here so that GRANT … (column) does not fail without applying
--   20260813231600_receiving_umag_v1_foundation.sql.
--
-- Security:
--   * Aborts on production project ref (JWT claim, optional GUC, or known ref).
--   * Aborts if public already has a real Shugyla / procurement schema.
--   * RLS on; anon has no table privileges; no USING (true) policies.
--   * auth_private helpers are fail-closed stubs (always false).
-- =============================================================================

select pg_advisory_xact_lock(202608151000);

do $$
declare
  v_ref text := '';
  v_claims text;
  v_jwt jsonb;
  v_setting text;
  v_public_tables integer := 0;
  v_blocked_rel text;
begin
  -- Optional operator pin: set session "app.supabase_project_ref" = '<ref>';
  v_setting := current_setting('app.supabase_project_ref', true);
  if v_setting is not null then
    v_ref := btrim(v_setting);
  end if;

  if v_ref = '' then
    v_setting := current_setting('supabase.project_id', true);
    if v_setting is not null then
      v_ref := btrim(v_setting);
    end if;
  end if;

  if v_ref = '' then
    v_claims := current_setting('request.jwt.claims', true);
    if v_claims is not null and v_claims <> '' then
      begin
        v_jwt := v_claims::jsonb;
        v_ref := coalesce(nullif(btrim(coalesce(v_jwt->>'ref', '')), ''), '');
      exception
        when others then
          v_ref := '';
      end;
    end if;
  end if;

  if v_ref = 'cxadzerxndlscwvdaymk' then
    raise exception
      'TEST-ONLY procurement ABC bootstrap refused: production project ref detected'
      using errcode = '42501';
  end if;

  -- Refuse anything that is not an empty disposable public schema.
  -- snake_* leftover demo tables are allowed and must not be dropped.
  select count(*)::integer
    into v_public_tables
  from pg_class as c
  join pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname not like 'snake_%';

  if v_public_tables > 0 then
    raise exception
      'TEST-ONLY procurement ABC bootstrap refused: public schema is not empty (% non-snake tables). Empty disposable project only; will not alter a real Shugyla schema.',
      v_public_tables
      using errcode = '42501';
  end if;

  foreach v_blocked_rel in array array[
    'public.academy_users',
    'public.permissions',
    'public.role_permissions',
    'public.platform_suppliers',
    'public.purchase_orders',
    'public.purchase_order_items',
    'public.receiving_documents',
    'public.receiving_items',
    'public.procurement_snapshots',
    'public.procurement_snapshot_items',
    'public.procurement_norm_rules'
  ]
  loop
    if to_regclass(v_blocked_rel) is not null then
      raise exception
        'TEST-ONLY procurement ABC bootstrap refused: existing real or partial Shugyla schema object %',
        v_blocked_rel
        using errcode = '42501';
    end if;
  end loop;

  if exists (
    select 1
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'generate_procurement_orders_from_snapshot',
        'generate_procurement_orders_from_snapshot_selected_unsafe',
        'procurement_snapshot_items_guard_update',
        'set_procurement_norm_rule_for_snapshot',
        'get_procurement_norm_taxonomy'
      )
  ) then
    raise exception
      'TEST-ONLY procurement ABC bootstrap refused: procurement functions already exist'
      using errcode = '42501';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- auth_private: TEST-ONLY fail-closed permission stubs
-- Real RBAC (academy_users / role_permissions) is intentionally absent.
-- Later procurement migrations call these helpers; they must exist with the
-- production signatures. Always false — no silent privilege grant.
-- ---------------------------------------------------------------------------

create schema if not exists auth_private;

revoke all on schema auth_private from public;
revoke all on schema auth_private from anon;
grant usage on schema auth_private to authenticated;
grant usage on schema auth_private to service_role;

create or replace function auth_private.current_user_has_permission(p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

comment on function auth_private.current_user_has_permission(text) is
  'TEST-ONLY fail-closed stub for an empty disposable Supabase project. Always false. Not production RBAC.';

alter function auth_private.current_user_has_permission(text) owner to postgres;

revoke all on function auth_private.current_user_has_permission(text) from public;
revoke all on function auth_private.current_user_has_permission(text) from anon;
grant execute on function auth_private.current_user_has_permission(text) to authenticated;
grant execute on function auth_private.current_user_has_permission(text) to service_role;

create or replace function auth_private.current_employee_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

comment on function auth_private.current_employee_is_active() is
  'TEST-ONLY fail-closed stub for an empty disposable Supabase project. Always false. Not production employee lookup.';

alter function auth_private.current_employee_is_active() owner to postgres;

revoke all on function auth_private.current_employee_is_active() from public;
revoke all on function auth_private.current_employee_is_active() from anon;
grant execute on function auth_private.current_employee_is_active() to authenticated;
grant execute on function auth_private.current_employee_is_active() to service_role;

-- ---------------------------------------------------------------------------
-- platform_suppliers
-- Shape from add_suppliers_module.sql + umag_supplier_id from
-- 20260727010000_centralize_suppliers_umag.sql (Edge select id, umag_supplier_id).
-- responsible_employee_id is a bare bigint: no FK to academy_users (that table
-- is not created here and must not be).
-- ---------------------------------------------------------------------------

create table public.platform_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  product_categories jsonb not null default '[]'::jsonb,
  manager_name text not null default '',
  manager_phone text not null default '',
  whatsapp text,
  order_days text not null default '',
  delivery_days text not null default '',
  min_order_amount numeric,
  payment_type text not null default 'cash',
  deferral_days integer,
  return_policy text not null default 'no',
  return_comment text,
  responsible_employee_id bigint,
  responsible_employee_name text,
  status text not null default 'active',
  comment text,
  umag_supplier_id bigint,
  bin text,
  umag_phone text,
  actual_address text,
  legal_address text,
  is_umag_active boolean not null default true,
  umag_last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_platform_suppliers_status on public.platform_suppliers (status);
create index idx_platform_suppliers_name on public.platform_suppliers (name);
create unique index uq_platform_suppliers_umag_supplier_id
  on public.platform_suppliers (umag_supplier_id)
  where umag_supplier_id is not null;
create index idx_platform_suppliers_bin
  on public.platform_suppliers (bin)
  where bin is not null;

comment on table public.platform_suppliers is
  'TEST-ONLY prerequisite for procurement ABC staging. Canonical supplier row; no production data.';

-- ---------------------------------------------------------------------------
-- purchase_orders / items
-- Base from add_purchase_module.sql + workflow_mode from
-- add_simple_procurement_workflow.sql + unit from receiving UMAG v1 (GRANT
-- target of 20260814134910). `number` omitted: generate RPC does not insert it
-- and a NOT NULL unique number would break that insert.
-- Lineage columns (source_snapshot_id, attempt_key, …) are added by real
-- migrations and must not be pre-created here.
-- ---------------------------------------------------------------------------

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.platform_suppliers (id) on delete set null,
  supplier_name text not null default '',
  status text not null default 'draft' check (status in (
    'draft', 'formed', 'sent', 'awaiting_receiving',
    'partially_received', 'received', 'cancelled'
  )),
  purchase_date date not null default current_date,
  expected_delivery_date date,
  total_amount numeric(14, 2) not null default 0,
  items_count integer not null default 0,
  created_by text,
  created_by_name text,
  comment text default '',
  transferred_to_receiving boolean not null default false,
  receiving_document_id uuid,
  workflow_mode text not null default 'analytics'
    check (workflow_mode in ('simple', 'analytics')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  product_name text not null default '',
  barcode text default '',
  unit text not null default '',
  supplier_id uuid references public.platform_suppliers (id) on delete set null,
  supplier_name text not null default '',
  stock_qty numeric(12, 3) not null default 0,
  sales_per_day numeric(12, 3) not null default 0,
  recommended_qty numeric(12, 3) not null default 0,
  ordered_qty numeric(12, 3) not null default 0,
  purchase_price numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  comment text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_purchase_orders_status on public.purchase_orders (status);
create index idx_purchase_orders_supplier on public.purchase_orders (supplier_id);
create index idx_purchase_orders_workflow on public.purchase_orders (workflow_mode);
create index idx_purchase_order_items_order on public.purchase_order_items (purchase_order_id);

comment on table public.purchase_orders is
  'TEST-ONLY prerequisite for procurement ABC staging. No production rows.';
comment on table public.purchase_order_items is
  'TEST-ONLY prerequisite for procurement ABC staging. No production rows.';
comment on column public.purchase_order_items.unit is
  'UMAG measure/unit snapshot copied from the procurement snapshot.';

-- ---------------------------------------------------------------------------
-- receiving_documents / items
-- Base from add_purchase_module.sql + total_amount/workflow_mode from
-- add_simple_procurement_workflow.sql + receiving UMAG v1 columns that
-- 20260814134910 grants by name. `number` omitted (same reason as orders).
-- last_exported_by is uuid without FK to auth.users (portable; type matches).
-- ---------------------------------------------------------------------------

create table public.receiving_documents (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references public.purchase_orders (id) on delete set null,
  supplier_id uuid references public.platform_suppliers (id) on delete set null,
  supplier_name text not null default '',
  status text not null default 'awaiting_receiving' check (status in (
    'awaiting_receiving', 'in_progress', 'partially_received', 'received', 'cancelled'
  )),
  expected_delivery_date date,
  received_by text,
  received_by_name text,
  created_by text,
  created_by_name text,
  comment text default '',
  total_ordered_qty numeric(12, 3) not null default 0,
  total_received_qty numeric(12, 3) not null default 0,
  total_difference_qty numeric(12, 3) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  workflow_mode text not null default 'analytics'
    check (workflow_mode in ('simple', 'analytics')),
  supplier_invoice_numbers text[] not null default '{}',
  version bigint not null default 1
    check (version > 0),
  started_at timestamptz,
  completed_at timestamptz,
  total_received_amount numeric(20, 4) not null default 0
    check (total_received_amount >= 0),
  export_version bigint not null default 0
    check (export_version >= 0),
  last_exported_at timestamptz,
  last_exported_by uuid,
  last_export_filename text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.receiving_items (
  id uuid primary key default gen_random_uuid(),
  receiving_document_id uuid not null references public.receiving_documents (id) on delete cascade,
  purchase_order_item_id uuid references public.purchase_order_items (id) on delete set null,
  product_name text not null default '',
  barcode text default '',
  unit text not null default '',
  ordered_qty numeric(12, 3) not null default 0,
  received_qty numeric(12, 3) not null default 0,
  difference_qty numeric(12, 3) not null default 0,
  purchase_price numeric(14, 2) not null default 0,
  actual_purchase_price numeric(20, 4) not null default 0,
  is_outside_order boolean not null default false,
  discrepancy_reason text,
  discrepancy_reason_code text,
  photo_urls text[] not null default '{}',
  photo_metadata jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  comment text default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receiving_items_quantities_nonnegative
    check (ordered_qty >= 0 and received_qty >= 0),
  constraint receiving_items_prices_nonnegative
    check (purchase_price >= 0 and actual_purchase_price >= 0),
  constraint receiving_items_outside_order_shape
    check (
      not is_outside_order
      or (purchase_order_item_id is null and ordered_qty = 0)
    ),
  constraint receiving_items_photo_metadata_array
    check (jsonb_typeof(photo_metadata) = 'array')
);

create index idx_receiving_documents_purchase on public.receiving_documents (purchase_order_id);
create index idx_receiving_documents_workflow on public.receiving_documents (workflow_mode);
create index idx_receiving_items_document on public.receiving_items (receiving_document_id);

comment on table public.receiving_documents is
  'TEST-ONLY prerequisite for procurement ABC staging. No production rows.';
comment on table public.receiving_items is
  'TEST-ONLY prerequisite for procurement ABC staging. No production rows.';

-- ---------------------------------------------------------------------------
-- RLS + GRANTs: deny-by-default. No anon privileges. No USING (true).
-- Authenticated may receive SELECT (later migrations add column GRANTs);
-- RLS has no policies here, so client reads/writes are empty/denied until
-- later migrations add fail-closed policies. service_role keeps ALL (bypass RLS).
-- ---------------------------------------------------------------------------

alter table public.platform_suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.receiving_documents enable row level security;
alter table public.receiving_items enable row level security;

revoke all on table public.platform_suppliers from public;
revoke all on table public.platform_suppliers from anon;
revoke all on table public.platform_suppliers from authenticated;
revoke all on table public.purchase_orders from public;
revoke all on table public.purchase_orders from anon;
revoke all on table public.purchase_orders from authenticated;
revoke all on table public.purchase_order_items from public;
revoke all on table public.purchase_order_items from anon;
revoke all on table public.purchase_order_items from authenticated;
revoke all on table public.receiving_documents from public;
revoke all on table public.receiving_documents from anon;
revoke all on table public.receiving_documents from authenticated;
revoke all on table public.receiving_items from public;
revoke all on table public.receiving_items from anon;
revoke all on table public.receiving_items from authenticated;

grant select on table public.platform_suppliers to authenticated;
grant select on table public.purchase_orders to authenticated;
grant select on table public.purchase_order_items to authenticated;
grant select on table public.receiving_documents to authenticated;
grant select on table public.receiving_items to authenticated;

grant all on table public.platform_suppliers to service_role;
grant all on table public.purchase_orders to service_role;
grant all on table public.purchase_order_items to service_role;
grant all on table public.receiving_documents to service_role;
grant all on table public.receiving_items to service_role;
