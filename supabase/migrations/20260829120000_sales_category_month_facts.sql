-- Продажи: monthly revenue/margin facts per category, sourced from UMAG's
-- list-product-report. Each sync call re-aggregates one calendar month and
-- upserts (replaces) that month's rows — this is a rebuildable aggregate,
-- not an immutable snapshot (see procurement_snapshots for that pattern);
-- history is preserved across months, not across re-syncs of the same month.

select pg_advisory_xact_lock(202608291200);

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (code, name, module, sort_order)
values
  ('sales.view', 'Просмотр продаж', 'sales', 180),
  ('sales.sync', 'Синхронизация продаж из UMAG', 'sales', 181)
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
  and p.code in ('sales.view', 'sales.sync')
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- umag_sync_runs: allow journaling sales-facts syncs under this table's
-- existing entity/status/lock machinery (see 20260726220000, 20260819120000).
-- ---------------------------------------------------------------------------

alter table public.umag_sync_runs
  drop constraint if exists umag_sync_runs_entity_check;

alter table public.umag_sync_runs
  add constraint umag_sync_runs_entity_check check (
    entity in ('suppliers', 'supplies', 'all', 'obligations', 'sales_facts')
  );

comment on column public.umag_sync_runs.entity is
  'Sync scope: suppliers | supplies | all | obligations | sales_facts (monthly category revenue/margin facts).';

-- ---------------------------------------------------------------------------
-- sales_category_month_facts
-- ---------------------------------------------------------------------------

create table if not exists public.sales_category_month_facts (
  id uuid primary key default gen_random_uuid(),
  month_key date not null,
  category_name text not null default '',
  subcategory_name text not null default '',
  revenue numeric(20, 4) not null default 0,
  cogs numeric(20, 4) not null default 0,
  profit numeric(20, 4) not null default 0,
  quantity numeric(20, 4) not null default 0,
  sku_count integer not null default 0,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_category_month_facts_month_first_day check (
    month_key = date_trunc('month', month_key)::date
  ),
  constraint sales_category_month_facts_unique unique (
    month_key, category_name, subcategory_name
  )
);

create index if not exists idx_sales_category_month_facts_month
  on public.sales_category_month_facts (month_key desc);

comment on table public.sales_category_month_facts is
  'Monthly revenue/cogs/profit per category+subcategory, aggregated from UMAG '
  'list-product-report by the sales_facts sync. Category is attributed via the '
  'CURRENT stock catalog (barcode join) at sync time — UMAG sales rows carry '
  'no category of their own, and taxonomy is assumed stable enough that a '
  'present-day mapping is a reasonable stand-in for a historical month''s.';

comment on column public.sales_category_month_facts.month_key is
  'First day of the aggregated calendar month (Asia/Almaty), e.g. 2025-01-01.';

drop trigger if exists sales_category_month_facts_updated_at on public.sales_category_month_facts;
create trigger sales_category_month_facts_updated_at
  before update on public.sales_category_month_facts
  for each row
  execute function public.academy_set_updated_at();

alter table public.sales_category_month_facts enable row level security;

revoke all on table public.sales_category_month_facts from public;
revoke all on table public.sales_category_month_facts from anon;
revoke all on table public.sales_category_month_facts from authenticated;
grant select on table public.sales_category_month_facts to authenticated;
grant all on table public.sales_category_month_facts to service_role;

drop policy if exists sales_category_month_facts_select on public.sales_category_month_facts;
create policy sales_category_month_facts_select
  on public.sales_category_month_facts
  for select
  to authenticated
  using (auth_private.current_user_has_permission('sales.view'));
