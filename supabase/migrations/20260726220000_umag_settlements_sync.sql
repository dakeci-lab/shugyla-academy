-- UMAG settlements stage 1: suppliers + supplies mirror + sync journal (single-tenant)

select pg_advisory_xact_lock(202607262200);

-- Permissions
insert into public.permissions (code, name, module, sort_order)
values
  ('umag.settlements.view', 'Просмотр взаиморасчётов UMAG', 'umag', 170),
  ('umag.settlements.sync', 'Синхронизация UMAG', 'umag', 171)
on conflict (code) do update
set
  name = excluded.name,
  module = excluded.module,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'admin'
  and p.code in ('umag.settlements.view', 'umag.settlements.sync')
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- umag_suppliers
-- ---------------------------------------------------------------------------

create table if not exists public.umag_suppliers (
  id uuid primary key default gen_random_uuid(),
  umag_supplier_id bigint not null,
  name text not null,
  legal_name text null,
  bin text null,
  phone text null,
  actual_address text null,
  legal_address text null,
  is_deleted boolean not null default false,
  umag_edit_time timestamptz null,
  raw_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint umag_suppliers_umag_id_unique unique (umag_supplier_id),
  constraint umag_suppliers_name_not_empty check (char_length(trim(name)) > 0)
);

create index if not exists idx_umag_suppliers_name on public.umag_suppliers (name);
create index if not exists idx_umag_suppliers_is_deleted on public.umag_suppliers (is_deleted);

comment on table public.umag_suppliers is
  'Read-only mirror of UMAG suppliers (agentType=SUPPLIER). Source of truth is UMAG.';

drop trigger if exists umag_suppliers_updated_at on public.umag_suppliers;
create trigger umag_suppliers_updated_at
  before update on public.umag_suppliers
  for each row
  execute function public.academy_set_updated_at();

alter table public.umag_suppliers enable row level security;

revoke all on table public.umag_suppliers from public;
revoke all on table public.umag_suppliers from anon;
revoke all on table public.umag_suppliers from authenticated;
grant select on table public.umag_suppliers to authenticated;
grant all on table public.umag_suppliers to service_role;

drop policy if exists umag_suppliers_select_view on public.umag_suppliers;
create policy umag_suppliers_select_view
  on public.umag_suppliers
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('umag.settlements.view')
    or auth_private.current_user_has_permission('suppliers.view')
  );

-- ---------------------------------------------------------------------------
-- umag_supplies
-- ---------------------------------------------------------------------------

create table if not exists public.umag_supplies (
  id uuid primary key default gen_random_uuid(),
  umag_supply_id bigint not null,
  supplier_id uuid null references public.umag_suppliers (id) on delete set null,
  umag_supplier_id bigint null,
  supplier_name text not null default '',
  supplier_legal_name text null,
  doc_time timestamptz not null,
  umag_edit_time timestamptz null,
  type integer null,
  payment_type integer null,
  amount numeric(20, 4) not null default 0,
  payment_amount numeric(20, 4) not null default 0,
  payment_refund_amount numeric(20, 4) not null default 0,
  debt numeric(20, 4) not null default 0,
  arrival_cost numeric(20, 4) null,
  selling_cost numeric(20, 4) null,
  account text null,
  comment text null,
  umag_user_id bigint null,
  umag_user_name text null,
  raw_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint umag_supplies_umag_id_unique unique (umag_supply_id)
);

create index if not exists idx_umag_supplies_doc_time on public.umag_supplies (doc_time);
create index if not exists idx_umag_supplies_supplier_id on public.umag_supplies (supplier_id);
create index if not exists idx_umag_supplies_umag_supplier_id on public.umag_supplies (umag_supplier_id);

comment on table public.umag_supplies is
  'Read-only mirror of UMAG supply documents (приёмки). Financial summary only — no product lines.';

drop trigger if exists umag_supplies_updated_at on public.umag_supplies;
create trigger umag_supplies_updated_at
  before update on public.umag_supplies
  for each row
  execute function public.academy_set_updated_at();

alter table public.umag_supplies enable row level security;

revoke all on table public.umag_supplies from public;
revoke all on table public.umag_supplies from anon;
revoke all on table public.umag_supplies from authenticated;
grant select on table public.umag_supplies to authenticated;
grant all on table public.umag_supplies to service_role;

drop policy if exists umag_supplies_select_view on public.umag_supplies;
create policy umag_supplies_select_view
  on public.umag_supplies
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('umag.settlements.view')
    or auth_private.current_user_has_permission('suppliers.view')
  );

-- ---------------------------------------------------------------------------
-- umag_sync_runs
-- ---------------------------------------------------------------------------

create table if not exists public.umag_sync_runs (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  date_from date null,
  date_to date null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  status text not null default 'running',
  records_received integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  source_total_count integer null,
  source_amount numeric(20, 4) null,
  source_payment_amount numeric(20, 4) null,
  source_payment_refund_amount numeric(20, 4) null,
  source_debt numeric(20, 4) null,
  calculated_amount numeric(20, 4) null,
  calculated_payment_amount numeric(20, 4) null,
  calculated_payment_refund_amount numeric(20, 4) null,
  calculated_debt numeric(20, 4) null,
  aggregates_match boolean null,
  warning_message text null,
  error_message text null,
  created_at timestamptz not null default now(),
  constraint umag_sync_runs_status_check check (
    status in ('running', 'success', 'partial', 'failed')
  ),
  constraint umag_sync_runs_entity_check check (
    entity in ('suppliers', 'supplies', 'all')
  )
);

create index if not exists idx_umag_sync_runs_started_at
  on public.umag_sync_runs (started_at desc);

comment on table public.umag_sync_runs is
  'Journal of UMAG sync operations for settlements diagnostics.';

alter table public.umag_sync_runs enable row level security;

revoke all on table public.umag_sync_runs from public;
revoke all on table public.umag_sync_runs from anon;
revoke all on table public.umag_sync_runs from authenticated;
grant select on table public.umag_sync_runs to authenticated;
grant all on table public.umag_sync_runs to service_role;

drop policy if exists umag_sync_runs_select_view on public.umag_sync_runs;
create policy umag_sync_runs_select_view
  on public.umag_sync_runs
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('umag.settlements.view')
    or auth_private.current_user_has_permission('umag.settlements.sync')
  );
