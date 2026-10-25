-- Stage 24 — remove the dead category norms and ABC analysis from the database.
-- Docs: docs/db/stage-24-remove-norms-and-abc/
--
-- ORDER OF WORK: first deploy the Edge functions umag-procurement and procurement-archive from the same commit
-- (they no longer read procurement_norm_rules / norm_days / abc_* / reserve_status), THEN run this file once.
-- No CASCADE and no IF EXISTS on purpose (project rule): a surprise dependency must fail the whole transaction.

begin;

-- 1. Functions that still mention the columns being dropped.
create or replace function public.procurement_snapshot_items_guard_update()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
     or new.created_at is distinct from old.created_at
  then
    raise exception 'procurement_snapshot_items: fact columns are immutable'
      using errcode = '42501';
  end if;

  if new.recommended_qty is distinct from old.recommended_qty
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
$function$;

create or replace function public.compute_procurement_snapshot_rollup(p_snapshot_id uuid)
returns integer
language sql
set search_path to ''
as $function$
  with ins as (
    insert into public.procurement_snapshot_category_rollup (
      snapshot_id, snapshot_date, category_name, subcategory_name,
      item_count, negative_stock_count, orderable_count,
      no_demand_count, under_norm_count, on_norm_count, over_norm_count,
      total_stock_purchase_value, total_stock_selling_value
    )
    select
      i.snapshot_id,
      coalesce(s.synced_at, s.created_at)::date,
      i.category_name,
      i.subcategory_name,
      count(*)::int,
      count(*) filter (where i.negative_stock)::int,
      count(*) filter (where i.final_order_qty > 0)::int,
      count(*) filter (where i.plan_status = 'no_demand')::int,
      count(*) filter (where i.plan_status = 'under_norm')::int,
      count(*) filter (where i.plan_status = 'on_norm')::int,
      count(*) filter (where i.plan_status = 'over_norm')::int,
      round(sum(i.raw_stock * i.purchase_price)::numeric, 2),
      round(sum(i.raw_stock * i.selling_price)::numeric, 2)
    from public.procurement_snapshot_items i
    join public.procurement_snapshots s on s.id = i.snapshot_id
    where i.snapshot_id = p_snapshot_id
    group by i.snapshot_id, coalesce(s.synced_at, s.created_at)::date, i.category_name, i.subcategory_name
    on conflict (snapshot_id, category_name, subcategory_name) do nothing
    returning 1
  )
  select count(*)::int from ins;
$function$;

-- 2. Norms: journal trigger + function, tables, functions.
drop trigger procurement_norm_rules_journal on public.procurement_norm_rules;
drop function public.procurement_norm_rules_journal();
drop table public.procurement_norm_changes;
drop table public.procurement_norm_rules;
drop function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text);
drop function public.get_procurement_norm_taxonomy(uuid);

-- 3. Snapshot items: dead columns (their indexes go with them).
alter table public.procurement_snapshot_items drop column reserve_status;
alter table public.procurement_snapshot_items drop column norm_days;
alter table public.procurement_snapshot_items drop column abc_qty;
alter table public.procurement_snapshot_items drop column abc_revenue;
alter table public.procurement_snapshot_items drop column abc_profit;

-- 4. The permission that only guarded the norms.
delete from public.role_permissions
where permission_id = (select id from public.permissions where code = 'procurement.norms.manage');
delete from public.permissions where code = 'procurement.norms.manage';

commit;
