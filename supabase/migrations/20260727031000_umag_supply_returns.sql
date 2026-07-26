-- UMAG supply returns (возвраты поставщикам) mirror + reconciliation snapshot fields
-- Single-tenant project; source of truth is UMAG.

select pg_advisory_xact_lock(202607270310);

-- ---------------------------------------------------------------------------
-- umag_supply_returns
-- ---------------------------------------------------------------------------

create table if not exists public.umag_supply_returns (
  id uuid primary key default gen_random_uuid(),
  umag_return_id bigint not null,
  platform_supplier_id uuid null references public.platform_suppliers (id) on delete set null,
  umag_supplier_id bigint null,
  store_id bigint null,
  umag_user_id bigint null,
  supplier_name text null,
  user_name text null,
  amount numeric(20, 4) not null default 0,
  payed_amount numeric(20, 4) null,
  document_time timestamptz not null,
  operation_time timestamptz null,
  create_time timestamptz null,
  umag_update_time timestamptz null,
  operation_type text null,
  note text null,
  is_provided boolean null,
  account_names jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  is_source_deleted boolean not null default false,
  source_deleted_at timestamptz null,
  last_seen_at timestamptz null,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint umag_supply_returns_umag_id_unique unique (umag_return_id)
);

create index if not exists idx_umag_supply_returns_document_time
  on public.umag_supply_returns (document_time);
create index if not exists idx_umag_supply_returns_platform_supplier_id
  on public.umag_supply_returns (platform_supplier_id);
create index if not exists idx_umag_supply_returns_umag_supplier_id
  on public.umag_supply_returns (umag_supplier_id);
create index if not exists idx_umag_supply_returns_is_source_deleted
  on public.umag_supply_returns (is_source_deleted);
create index if not exists idx_umag_supply_returns_active_document_time
  on public.umag_supply_returns (document_time)
  where is_source_deleted = false;

comment on table public.umag_supply_returns is
  'Read-only mirror of UMAG supply returns (возвраты поставщикам). Mapped via agentId → umag_supplier_id → platform_suppliers.';
comment on column public.umag_supply_returns.amount is
  'UMAG source amount kept as positive numeric; UI may present as negative for returns.';
comment on column public.umag_supply_returns.is_source_deleted is
  'True when return was previously imported but missing from a fully successful UMAG period snapshot.';

drop trigger if exists umag_supply_returns_updated_at on public.umag_supply_returns;
create trigger umag_supply_returns_updated_at
  before update on public.umag_supply_returns
  for each row
  execute function public.academy_set_updated_at();

alter table public.umag_supply_returns enable row level security;

revoke all on table public.umag_supply_returns from public;
revoke all on table public.umag_supply_returns from anon;
revoke all on table public.umag_supply_returns from authenticated;
grant select on table public.umag_supply_returns to authenticated;
grant all on table public.umag_supply_returns to service_role;

drop policy if exists umag_supply_returns_select_view on public.umag_supply_returns;
create policy umag_supply_returns_select_view
  on public.umag_supply_returns
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('umag.settlements.view')
    or auth_private.current_user_has_permission('suppliers.view')
  );

-- ---------------------------------------------------------------------------
-- umag_sync_runs — return counters
-- ---------------------------------------------------------------------------

alter table public.umag_sync_runs
  add column if not exists returns_received integer not null default 0,
  add column if not exists returns_created integer not null default 0,
  add column if not exists returns_updated integer not null default 0,
  add column if not exists returns_source_deleted integer not null default 0,
  add column if not exists returns_reactivated integer not null default 0,
  add column if not exists source_return_count integer null,
  add column if not exists source_return_amount numeric(20, 4) null,
  add column if not exists calculated_return_amount numeric(20, 4) null;

comment on column public.umag_sync_runs.returns_received is
  'Supply returns received from UMAG for the synced period.';
comment on column public.umag_sync_runs.returns_source_deleted is
  'Active DB returns in period marked is_source_deleted after successful full snapshot reconciliation.';

-- ---------------------------------------------------------------------------
-- supplier_reconciliations — immutable return snapshot fields (new acts only)
-- ---------------------------------------------------------------------------

alter table public.supplier_reconciliations
  add column if not exists umag_supply_return_count integer not null default 0,
  add column if not exists umag_supply_return_amount numeric(20, 4) not null default 0;

comment on column public.supplier_reconciliations.umag_supply_return_count is
  'Frozen COUNT of active umag_supply_returns at reconciliation create time.';
comment on column public.supplier_reconciliations.umag_supply_return_amount is
  'Frozen SUM(amount) of active umag_supply_returns at reconciliation create time.';
