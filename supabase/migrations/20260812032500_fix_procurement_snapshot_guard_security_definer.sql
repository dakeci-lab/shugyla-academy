-- ---------------------------------------------------------------------------
-- Fix: permission denied for table procurement_snapshots
--
-- procurement_snapshot_items_guard_update() locks the parent snapshot with
--   select s.status ... from public.procurement_snapshots ... for share
-- to serialize planning edits against concurrent generation (which takes
-- FOR UPDATE). In PostgreSQL a row-locking clause (FOR SHARE / FOR UPDATE)
-- requires the UPDATE privilege on the table, not merely SELECT
-- (ACL_SELECT_FOR_UPDATE == ACL_UPDATE in the executor permission check).
--
-- Role `authenticated` holds only `grant select` on procurement_snapshots
-- (20260809072915_procurement_planning_v1.sql:642), so a buyer editing
-- final_order_qty hit:
--   permission denied for table procurement_snapshots
--
-- The guard must not depend on the caller's privileges: it is a server-side
-- invariant, and every sibling function in the procurement migrations is
-- already `security definer`. This migration adds `security definer` to the
-- guard and nothing else.
--
-- Deliberately NOT done: granting UPDATE on procurement_snapshots to
-- `authenticated`. That would open the UMAG fact snapshot itself to writes.
--
-- Body below is copied verbatim from
-- 20260810160315_procurement_partial_supplier_generation.sql:114
-- The only change is the added `security definer` line.
-- ---------------------------------------------------------------------------

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
     or new.created_at is distinct from old.created_at
  then
    raise exception 'procurement_snapshot_items: fact columns are immutable'
      using errcode = '42501';
  end if;

  if old.generated_purchase_order_id is not null
     and new.generated_purchase_order_id is distinct from old.generated_purchase_order_id
  then
    raise exception 'procurement_snapshot_items: generated_purchase_order_id is immutable once set'
      using errcode = '42501';
  end if;

  if new.norm_days is distinct from old.norm_days
     or new.recommended_qty is distinct from old.recommended_qty
     or new.final_order_qty is distinct from old.final_order_qty
     or new.manual_override is distinct from old.manual_override
  then
    select s.status
      into v_snapshot_status
    from public.procurement_snapshots as s
    where s.id = new.snapshot_id
    for share;

    if not found or v_snapshot_status not in ('ready', 'partially_generated') then
      raise exception 'procurement_snapshot_items: planning fields editable only in a working snapshot'
        using errcode = '42501';
    end if;

    if old.generated_purchase_order_id is not null then
      raise exception 'procurement_snapshot_items: generated order rows are immutable'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

alter function public.procurement_snapshot_items_guard_update() owner to postgres;

comment on function public.procurement_snapshot_items_guard_update() is
  'BEFORE UPDATE guard on procurement_snapshot_items. security definer: the FOR SHARE lock on procurement_snapshots requires UPDATE privilege, which authenticated must not have.';

-- The trigger binding survives create or replace; no trigger DDL needed.
