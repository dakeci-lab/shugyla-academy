-- Refresh the stock of ONE supplier in the latest snapshot (the «обновить» button of «Товары поставщика»).
-- Called only by the umag-procurement Edge function (service role) with the stock rows UMAG returned for the whole store:
-- only this supplier's rows are touched, the plan is recomputed for this supplier only. Sales (8 weeks) stay from the daily sync.
-- Additive migration: one new function, nothing is changed or removed.

create or replace function public.procurement_refresh_supplier_stock(
  p_snapshot_id uuid,
  p_supplier_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_updated integer;
  v_planned integer;
begin
  select s.status into v_status from public.procurement_snapshots s where s.id = p_snapshot_id;
  if v_status is null or v_status not in ('ready', 'partially_generated', 'generated') then
    raise exception 'procurement_refresh_supplier_stock: snapshot is not ready' using errcode = '22023';
  end if;

  -- The facts of a snapshot are immutable for ordinary writes (procurement_snapshot_items_guard_update);
  -- like procurement_apply_plan this function lifts the guard for its own transaction only.
  perform set_config('app.items_guard_skip', '1', true);

  with incoming as (
    select r.barcode,
           coalesce(r.stock, 0) as stock,
           r.cost,
           r.price
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
      as r(barcode text, stock numeric, cost numeric, price numeric)
  )
  update public.procurement_snapshot_items i
  set raw_stock = coalesce(n.stock, 0),
      calculation_stock = greatest(0, coalesce(n.stock, 0)),
      negative_stock = coalesce(n.stock, 0) < 0,
      purchase_price = coalesce(n.cost, i.purchase_price),
      selling_price = coalesce(n.price, i.selling_price),
      updated_at = now()
  from public.procurement_snapshot_items i2
  left join incoming n on n.barcode = i2.barcode
  where i.id = i2.id
    and i.snapshot_id = p_snapshot_id
    and i.platform_supplier_id = p_supplier_id;
  get diagnostics v_updated = row_count;

  perform set_config('app.items_guard_skip', '0', true);

  update public.procurement_snapshots s
  set negative_stock_count = (
    select count(*) from public.procurement_snapshot_items i
    where i.snapshot_id = p_snapshot_id and i.negative_stock)
  where s.id = p_snapshot_id;

  v_planned := public.procurement_apply_plan(p_snapshot_id, p_supplier_id);

  return jsonb_build_object('updated', v_updated, 'replanned', v_planned);
end;
$function$;

revoke all on function public.procurement_refresh_supplier_stock(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.procurement_refresh_supplier_stock(uuid, uuid, jsonb) to service_role;
