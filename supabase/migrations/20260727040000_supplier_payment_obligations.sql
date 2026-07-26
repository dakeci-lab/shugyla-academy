-- Supplier payment obligations (календарь оплат поставщикам)
-- Single-tenant. Debt source of truth remains umag_supplies.debt.
-- Terms snapshot uses existing platform_suppliers.payment_type / deferral_days.

select pg_advisory_xact_lock(202607270400);

-- Permissions
insert into public.permissions (code, name, module, sort_order)
values
  ('supplier_payments.view', 'Просмотр оплат поставщикам', 'supplier_payments', 190),
  ('supplier_payments.manage', 'Управление календарём оплат поставщикам', 'supplier_payments', 191)
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
  and p.code in ('supplier_payments.view', 'supplier_payments.manage')
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- supplier_payment_obligations
-- ---------------------------------------------------------------------------

create table if not exists public.supplier_payment_obligations (
  id uuid primary key default gen_random_uuid(),
  platform_supplier_id uuid null references public.platform_suppliers (id) on delete set null,
  umag_supply_id bigint not null,
  umag_supply_row_id uuid null references public.umag_supplies (id) on delete set null,
  supply_document_date date null,
  source_doc_time timestamptz null,
  original_supply_amount numeric(20, 4) not null default 0,
  current_payment_amount numeric(20, 4) not null default 0,
  current_debt numeric(20, 4) not null default 0,
  payment_terms_type_snapshot text null,
  deferment_days_snapshot integer null,
  due_date date null,
  terms_snapshot_created_at timestamptz null,
  is_source_deleted boolean not null default false,
  source_deleted_at timestamptz null,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  paid_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_payment_obligations_umag_supply_unique unique (umag_supply_id),
  constraint supplier_payment_obligations_deferment_days_check check (
    deferment_days_snapshot is null
    or (deferment_days_snapshot >= 0 and deferment_days_snapshot <= 365)
  )
);

create index if not exists idx_spo_platform_supplier_id
  on public.supplier_payment_obligations (platform_supplier_id);
create index if not exists idx_spo_due_date
  on public.supplier_payment_obligations (due_date);
create index if not exists idx_spo_current_debt
  on public.supplier_payment_obligations (current_debt);
create index if not exists idx_spo_is_source_deleted
  on public.supplier_payment_obligations (is_source_deleted);
create index if not exists idx_spo_active_due
  on public.supplier_payment_obligations (due_date, platform_supplier_id)
  where is_source_deleted = false and current_debt > 0;

comment on table public.supplier_payment_obligations is
  'Payment schedule obligations derived from umag_supplies.debt. Terms snapshots are immutable after first fill.';
comment on column public.supplier_payment_obligations.deferment_days_snapshot is
  'Snapshot of platform_suppliers.deferral_days (or 0 for immediate cash/transfer). Immutable after first set.';
comment on column public.supplier_payment_obligations.current_debt is
  'Mirror of umag_supplies.debt; not computed from supplies-returns-payments.';

drop trigger if exists supplier_payment_obligations_updated_at on public.supplier_payment_obligations;
create trigger supplier_payment_obligations_updated_at
  before update on public.supplier_payment_obligations
  for each row
  execute function public.academy_set_updated_at();

alter table public.supplier_payment_obligations enable row level security;

revoke all on table public.supplier_payment_obligations from public;
revoke all on table public.supplier_payment_obligations from anon;
revoke all on table public.supplier_payment_obligations from authenticated;
grant select, update on table public.supplier_payment_obligations to authenticated;
grant all on table public.supplier_payment_obligations to service_role;

drop policy if exists supplier_payment_obligations_select on public.supplier_payment_obligations;
create policy supplier_payment_obligations_select
  on public.supplier_payment_obligations
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('supplier_payments.view')
    or auth_private.current_user_has_permission('suppliers.view')
  );

-- First-fill of missing due_date snapshots after supplier terms are configured.
-- Does not grant insert/delete to clients; debt fields are overwritten by umag-sync service_role.
drop policy if exists supplier_payment_obligations_update_terms on public.supplier_payment_obligations;
create policy supplier_payment_obligations_update_terms
  on public.supplier_payment_obligations
  for update
  to authenticated
  using (
    auth_private.current_user_has_permission('supplier_payments.manage')
    or auth_private.current_user_has_permission('suppliers.edit')
  )
  with check (
    auth_private.current_user_has_permission('supplier_payments.manage')
    or auth_private.current_user_has_permission('suppliers.edit')
  );

-- ---------------------------------------------------------------------------
-- Backfill from currently open-debt active supplies
-- ---------------------------------------------------------------------------

insert into public.supplier_payment_obligations (
  platform_supplier_id,
  umag_supply_id,
  umag_supply_row_id,
  supply_document_date,
  source_doc_time,
  original_supply_amount,
  current_payment_amount,
  current_debt,
  payment_terms_type_snapshot,
  deferment_days_snapshot,
  due_date,
  terms_snapshot_created_at,
  is_source_deleted,
  first_seen_at,
  last_synced_at,
  paid_at
)
select
  s.platform_supplier_id,
  s.umag_supply_id,
  s.id,
  (s.doc_time at time zone 'Asia/Aqtobe')::date,
  s.doc_time,
  coalesce(s.amount, 0),
  coalesce(s.payment_amount, 0),
  coalesce(s.debt, 0),
  case
    when p.payment_type in ('cash', 'transfer', 'deferral', 'mixed') then p.payment_type
    else null
  end as payment_terms_type_snapshot,
  case
    when p.payment_type in ('cash', 'transfer') then 0
    when p.payment_type in ('deferral', 'mixed')
      and p.deferral_days is not null
      and p.deferral_days >= 0
      and p.deferral_days <= 365
      then p.deferral_days
    else null
  end as deferment_days_snapshot,
  case
    when p.payment_type in ('cash', 'transfer')
      then (s.doc_time at time zone 'Asia/Aqtobe')::date
    when p.payment_type in ('deferral', 'mixed')
      and p.deferral_days is not null
      and p.deferral_days >= 0
      and p.deferral_days <= 365
      then (s.doc_time at time zone 'Asia/Aqtobe')::date + p.deferral_days
    else null
  end as due_date,
  case
    when p.payment_type in ('cash', 'transfer') then now()
    when p.payment_type in ('deferral', 'mixed')
      and p.deferral_days is not null
      and p.deferral_days >= 0
      and p.deferral_days <= 365
      then now()
    else null
  end as terms_snapshot_created_at,
  false,
  now(),
  now(),
  null
from public.umag_supplies s
left join public.platform_suppliers p on p.id = s.platform_supplier_id
where coalesce(s.is_source_deleted, false) = false
  and coalesce(s.debt, 0) > 0
on conflict (umag_supply_id) do nothing;
