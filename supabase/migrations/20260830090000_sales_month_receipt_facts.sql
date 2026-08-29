-- Продажи: monthly receipt count, sourced from UMAG's opr/sale/list-without-products.
-- Separate from sales_category_month_facts because a receipt spans multiple
-- categories — it is not a category-level fact, it is a whole-month total.
-- Средний чек (avg check) is derived client-side as revenue / receipt_count,
-- not stored — revenue already lives in sales_category_month_facts.

select pg_advisory_xact_lock(202608300900);

create table if not exists public.sales_month_receipt_facts (
  month_key date primary key,
  receipt_count integer not null default 0,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_month_receipt_facts_month_first_day check (
    month_key = date_trunc('month', month_key)::date
  )
);

comment on table public.sales_month_receipt_facts is
  'Monthly receipt (чек) counts from UMAG opr/sale/list-without-products, synced '
  'alongside sales_category_month_facts by the same sales_facts sync run.';

drop trigger if exists sales_month_receipt_facts_updated_at on public.sales_month_receipt_facts;
create trigger sales_month_receipt_facts_updated_at
  before update on public.sales_month_receipt_facts
  for each row
  execute function public.academy_set_updated_at();

alter table public.sales_month_receipt_facts enable row level security;

revoke all on table public.sales_month_receipt_facts from public;
revoke all on table public.sales_month_receipt_facts from anon;
revoke all on table public.sales_month_receipt_facts from authenticated;
grant select on table public.sales_month_receipt_facts to authenticated;
grant all on table public.sales_month_receipt_facts to service_role;

drop policy if exists sales_month_receipt_facts_select on public.sales_month_receipt_facts;
create policy sales_month_receipt_facts_select
  on public.sales_month_receipt_facts
  for select
  to authenticated
  using (auth_private.current_user_has_permission('sales.view'));
