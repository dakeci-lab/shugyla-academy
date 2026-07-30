-- UMAG document payments (оплаты поставщикам / возвраты денег) + supplier ledger events
-- Source: GET /rest/cabinet/fin/document-payment/list-all

select pg_advisory_xact_lock(202607301200);

-- ---------------------------------------------------------------------------
-- umag_document_payments
-- ---------------------------------------------------------------------------

create table if not exists public.umag_document_payments (
  id uuid primary key default gen_random_uuid(),
  umag_payment_id bigint not null,
  platform_supplier_id uuid null references public.platform_suppliers (id) on delete set null,
  umag_supplier_id bigint null,
  store_id bigint null,
  amount numeric(20, 4) not null default 0,
  payment_type text not null default '',
  class_name text null,
  entity_id bigint null,
  linked_umag_supply_id bigint null,
  linked_umag_return_id bigint null,
  account_id bigint null,
  account_name text null,
  external_agent_account_id bigint null,
  umag_user_id bigint null,
  user_name text null,
  supplier_name text null,
  note text null,
  payment_time timestamptz not null,
  doc_time timestamptz null,
  create_time timestamptz null,
  umag_edit_time timestamptz null,
  raw_payload jsonb not null default '{}'::jsonb,
  is_source_deleted boolean not null default false,
  source_deleted_at timestamptz null,
  last_seen_at timestamptz null,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint umag_document_payments_umag_id_unique unique (umag_payment_id)
);

create index if not exists idx_umag_document_payments_payment_time
  on public.umag_document_payments (payment_time);
create index if not exists idx_umag_document_payments_platform_supplier_id
  on public.umag_document_payments (platform_supplier_id);
create index if not exists idx_umag_document_payments_umag_supplier_id
  on public.umag_document_payments (umag_supplier_id);
create index if not exists idx_umag_document_payments_entity_id
  on public.umag_document_payments (entity_id);
create index if not exists idx_umag_document_payments_linked_supply
  on public.umag_document_payments (linked_umag_supply_id);
create index if not exists idx_umag_document_payments_linked_return
  on public.umag_document_payments (linked_umag_return_id);
create index if not exists idx_umag_document_payments_type
  on public.umag_document_payments (payment_type);
create index if not exists idx_umag_document_payments_active_time
  on public.umag_document_payments (payment_time)
  where is_source_deleted = false;

comment on table public.umag_document_payments is
  'Read-only mirror of UMAG fin/document-payment (supplier payments and refunds). payment_time is the real UMAG operation date.';
comment on column public.umag_document_payments.amount is
  'Signed UMAG amount: positive = payment to supplier (SUPPLY); negative = money from supplier (SUPPLY_REFUND).';
comment on column public.umag_document_payments.payment_type is
  'UMAG type string, e.g. SUPPLY or SUPPLY_REFUND.';

drop trigger if exists umag_document_payments_updated_at on public.umag_document_payments;
create trigger umag_document_payments_updated_at
  before update on public.umag_document_payments
  for each row
  execute function public.academy_set_updated_at();

alter table public.umag_document_payments enable row level security;

revoke all on table public.umag_document_payments from public;
revoke all on table public.umag_document_payments from anon;
revoke all on table public.umag_document_payments from authenticated;
grant select on table public.umag_document_payments to authenticated;
grant all on table public.umag_document_payments to service_role;

drop policy if exists umag_document_payments_select_view on public.umag_document_payments;
create policy umag_document_payments_select_view
  on public.umag_document_payments
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('umag.settlements.view')
    or auth_private.current_user_has_permission('suppliers.view')
  );

-- ---------------------------------------------------------------------------
-- platform_supplier_ledger_events (normalized reconciliation ledger)
-- ---------------------------------------------------------------------------

create table if not exists public.platform_supplier_ledger_events (
  id uuid primary key default gen_random_uuid(),
  platform_supplier_id uuid null references public.platform_suppliers (id) on delete set null,
  umag_supplier_id bigint null,
  supplier_name text null,
  external_source text not null default 'umag',
  external_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  document_number text null,
  amount numeric(20, 4) not null default 0,
  balance_delta numeric(20, 4) not null default 0,
  currency text not null default 'KZT',
  status text not null default 'posted',
  linked_umag_supply_id bigint null,
  linked_umag_return_id bigint null,
  linked_umag_payment_id bigint null,
  details text null,
  metadata jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_supplier_ledger_events_source_external_unique
    unique (external_source, event_type, external_id)
);

create index if not exists idx_platform_supplier_ledger_supplier_time
  on public.platform_supplier_ledger_events (platform_supplier_id, occurred_at);
create index if not exists idx_platform_supplier_ledger_umag_supplier_time
  on public.platform_supplier_ledger_events (umag_supplier_id, occurred_at);
create index if not exists idx_platform_supplier_ledger_occurred_at
  on public.platform_supplier_ledger_events (occurred_at);
create index if not exists idx_platform_supplier_ledger_event_type
  on public.platform_supplier_ledger_events (event_type);

comment on table public.platform_supplier_ledger_events is
  'Normalized supplier reconciliation ledger built from UMAG supplies, returns, and document-payments.';
comment on column public.platform_supplier_ledger_events.balance_delta is
  'Signed effect on accounts payable to supplier: + increases debt, - decreases debt.';

drop trigger if exists platform_supplier_ledger_events_updated_at on public.platform_supplier_ledger_events;
create trigger platform_supplier_ledger_events_updated_at
  before update on public.platform_supplier_ledger_events
  for each row
  execute function public.academy_set_updated_at();

alter table public.platform_supplier_ledger_events enable row level security;

revoke all on table public.platform_supplier_ledger_events from public;
revoke all on table public.platform_supplier_ledger_events from anon;
revoke all on table public.platform_supplier_ledger_events from authenticated;
grant select on table public.platform_supplier_ledger_events to authenticated;
grant all on table public.platform_supplier_ledger_events to service_role;

drop policy if exists platform_supplier_ledger_events_select_view on public.platform_supplier_ledger_events;
create policy platform_supplier_ledger_events_select_view
  on public.platform_supplier_ledger_events
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('umag.settlements.view')
    or auth_private.current_user_has_permission('suppliers.view')
  );
