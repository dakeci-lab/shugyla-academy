-- Procurement ABC analysis: immutable 8-week revenue/cogs/profit + three Pareto classes.
-- Old rows stay NULL (UI "—") until the next manual sync. No grant/RLS widening.

select pg_advisory_xact_lock(202608150726);

alter table public.procurement_snapshot_items
  add column if not exists revenue_8w numeric(14, 2),
  add column if not exists cogs_8w numeric(14, 2),
  add column if not exists profit_8w numeric(14, 2),
  add column if not exists abc_qty text,
  add column if not exists abc_revenue text,
  add column if not exists abc_profit text;

alter table public.procurement_snapshot_items
  drop constraint if exists procurement_snapshot_items_abc_qty_check,
  drop constraint if exists procurement_snapshot_items_abc_revenue_check,
  drop constraint if exists procurement_snapshot_items_abc_profit_check;

alter table public.procurement_snapshot_items
  add constraint procurement_snapshot_items_abc_qty_check
    check (abc_qty is null or abc_qty in ('A', 'B', 'C')),
  add constraint procurement_snapshot_items_abc_revenue_check
    check (abc_revenue is null or abc_revenue in ('A', 'B', 'C')),
  add constraint procurement_snapshot_items_abc_profit_check
    check (abc_profit is null or abc_profit in ('A', 'B', 'C'));

comment on column public.procurement_snapshot_items.revenue_8w is
  'UMAG saleSellingAmount summed over the snapshot 8-week window. NULL = not computed (legacy snapshot).';
comment on column public.procurement_snapshot_items.cogs_8w is
  'UMAG saleArrivalAmount summed over the snapshot 8-week window. NULL = not computed (legacy snapshot).';
comment on column public.procurement_snapshot_items.profit_8w is
  'revenue_8w - cogs_8w. Negative losses are stored as-is. NULL = not computed (legacy snapshot).';
comment on column public.procurement_snapshot_items.abc_qty is
  'Pareto class on sales_8w (80/95, whole snapshot). NULL = no positive qty or legacy snapshot.';
comment on column public.procurement_snapshot_items.abc_revenue is
  'Pareto class on revenue_8w (80/95, whole snapshot). NULL = no positive revenue or legacy snapshot.';
comment on column public.procurement_snapshot_items.abc_profit is
  'Pareto class on profit_8w (80/95). Negatives are C when the snapshot has a positive profit total; otherwise NULL.';

create index if not exists idx_psi_snapshot_abc_qty
  on public.procurement_snapshot_items (snapshot_id, abc_qty);
create index if not exists idx_psi_snapshot_abc_revenue
  on public.procurement_snapshot_items (snapshot_id, abc_revenue);
create index if not exists idx_psi_snapshot_abc_profit
  on public.procurement_snapshot_items (snapshot_id, abc_profit);

create or replace function public.procurement_snapshot_items_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot_status text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.snapshot_id is distinct from old.snapshot_id
     or new.barcode is distinct from old.barcode
     or new.product_name is distinct from old.product_name
     or new.category_id is distinct from old.category_id
     or new.category_name is distinct from old.category_name
     or new.subcategory_name is distinct from old.subcategory_name
     or new.umag_supplier_id is distinct from old.umag_supplier_id
     or new.umag_supplier_name is distinct from old.umag_supplier_name
     or new.platform_supplier_id is distinct from old.platform_supplier_id
     or new.measure is distinct from old.measure
     or new.raw_stock is distinct from old.raw_stock
     or new.calculation_stock is distinct from old.calculation_stock
     or new.negative_stock is distinct from old.negative_stock
     or new.weekly_sales is distinct from old.weekly_sales
     or new.sales_8w is distinct from old.sales_8w
     or new.avg_daily is distinct from old.avg_daily
     or new.purchase_price is distinct from old.purchase_price
     or new.selling_price is distinct from old.selling_price
     or new.revenue_8w is distinct from old.revenue_8w
     or new.cogs_8w is distinct from old.cogs_8w
     or new.profit_8w is distinct from old.profit_8w
     or new.abc_qty is distinct from old.abc_qty
     or new.abc_revenue is distinct from old.abc_revenue
     or new.abc_profit is distinct from old.abc_profit
     or new.created_at is distinct from old.created_at
  then
    raise exception 'procurement_snapshot_items: fact columns are immutable'
      using errcode = '42501';
  end if;

  if new.norm_days is distinct from old.norm_days
     or new.recommended_qty is distinct from old.recommended_qty
     or new.final_order_qty is distinct from old.final_order_qty
     or new.manual_override is distinct from old.manual_override
     or new.generated_purchase_order_id is distinct from old.generated_purchase_order_id
  then
    select s.status
      into v_snapshot_status
    from public.procurement_snapshots as s
    where s.id = new.snapshot_id;

    if not found or v_snapshot_status not in ('ready', 'partially_generated', 'generated') then
      raise exception 'procurement_snapshot_items: planning fields editable only in a working snapshot'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

alter function public.procurement_snapshot_items_guard_update() owner to postgres;

comment on function public.procurement_snapshot_items_guard_update() is
  'BEFORE UPDATE guard on procurement_snapshot_items. Fact columns stay immutable, including ABC metrics/classes. Planning qty is editable on a working snapshot even after previous orders. Reads snapshot status without locking: generate already locks snapshot then items, so FOR SHARE here inverted the lock order and deadlocked. RLS USING/WITH CHECK still require a working snapshot. security definer: the function historically selected FOR SHARE, which needs UPDATE on procurement_snapshots — authenticated must not have that privilege.';

revoke all on function public.procurement_snapshot_items_guard_update() from public;
revoke all on function public.procurement_snapshot_items_guard_update() from anon;
revoke all on function public.procurement_snapshot_items_guard_update() from authenticated;
revoke all on function public.procurement_snapshot_items_guard_update() from service_role;
