-- Stage 25a: order statuses «Черновик / Сохранён» — additive part (safe to apply before the new frontend).
-- Docs: docs/db/stage-25-order-statuses/
-- Legacy values (awaiting_receiving, received, formed, sent, partially_received) still read as «Сохранён»
-- until stage 25b renames them. Nothing is removed here.

-- 1) A draft can be edited by any active employee through the existing column grants, for every kind of order.
--    (The old *_simple policies stay until the owner removes them in stage 25b.)
create policy purchase_orders_update_draft on public.purchase_orders
  for update to authenticated
  using (auth_private.current_employee_is_active() and status = 'draft')
  with check (auth_private.current_employee_is_active() and status = 'draft');

create policy purchase_order_items_insert_draft on public.purchase_order_items
  for insert to authenticated
  with check (
    auth_private.current_employee_is_active()
    and exists (select 1 from public.purchase_orders o where o.id = purchase_order_id and o.status = 'draft')
  );

create policy purchase_order_items_update_draft on public.purchase_order_items
  for update to authenticated
  using (
    auth_private.current_employee_is_active()
    and exists (select 1 from public.purchase_orders o where o.id = purchase_order_id and o.status = 'draft')
  )
  with check (
    auth_private.current_employee_is_active()
    and exists (select 1 from public.purchase_orders o where o.id = purchase_order_id and o.status = 'draft')
  );

create policy purchase_order_items_delete_draft on public.purchase_order_items
  for delete to authenticated
  using (
    auth_private.current_employee_is_active()
    and exists (select 1 from public.purchase_orders o where o.id = purchase_order_id and o.status = 'draft')
  );

-- 2) Сохранён → Черновик («Отменить»). Plan quantities are NOT returned: the order stays, as a draft.
create or replace function public.procurement_unsave_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.purchase_orders;
begin
  if p_order_id is null then
    raise exception 'Заказ не найден' using errcode = '22004';
  end if;
  perform auth_private.require_procurement_edit();

  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if not found then
    raise exception 'Заказ не найден' using errcode = '22004';
  end if;

  if v_order.status = 'draft' then
    return jsonb_build_object('order_id', p_order_id, 'status', 'draft', 'changed', false);
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'Отменённый заказ нельзя вернуть в черновик' using errcode = '55000';
  end if;

  update public.receiving_documents
     set status = 'cancelled', updated_at = now()
   where purchase_order_id = p_order_id and status <> 'cancelled';

  update public.purchase_orders
     set status = 'draft',
         transferred_to_receiving = false,
         receiving_document_id = null,
         checked_at = null,
         checked_by_name = null,
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'status', 'draft', 'changed', true);
end;
$function$;

-- 3) Черновик → Сохранён («Сохранить»): totals are recomputed on the server, an empty order is refused.
create or replace function public.procurement_submit_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.purchase_orders;
  v_count integer;
  v_zero integer;
  v_total numeric;
begin
  if p_order_id is null then
    raise exception 'Заказ не найден' using errcode = '22004';
  end if;
  perform auth_private.require_procurement_edit();

  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if not found then
    raise exception 'Заказ не найден' using errcode = '22004';
  end if;

  if v_order.status <> 'draft' then
    return jsonb_build_object('order_id', p_order_id, 'status', v_order.status, 'changed', false);
  end if;

  select count(*), count(*) filter (where coalesce(ordered_qty, 0) <= 0)
    into v_count, v_zero
  from public.purchase_order_items where purchase_order_id = p_order_id;

  if v_count = 0 then
    raise exception 'В заказе нет товаров. Добавьте товары или удалите черновик' using errcode = '22023';
  end if;
  if v_zero > 0 then
    raise exception 'В заказе есть товары с нулевым количеством. Исправьте или удалите их' using errcode = '22023';
  end if;

  update public.purchase_order_items
     set total_amount = round(coalesce(ordered_qty, 0) * coalesce(purchase_price, 0), 2)
   where purchase_order_id = p_order_id;

  select coalesce(sum(total_amount), 0) into v_total
  from public.purchase_order_items where purchase_order_id = p_order_id;

  update public.purchase_orders
     set status = 'saved',
         items_count = v_count,
         total_amount = v_total,
         transferred_to_receiving = false,
         receiving_document_id = null,
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'status', 'saved', 'changed', true,
                            'items_count', v_count, 'total_amount', v_total);
end;
$function$;

revoke all on function public.procurement_unsave_order(uuid) from public, anon;
revoke all on function public.procurement_submit_order(uuid) from public, anon;
grant execute on function public.procurement_unsave_order(uuid) to authenticated;
grant execute on function public.procurement_submit_order(uuid) to authenticated;

-- 5) «В пути» in the plan: only saved orders (legacy awaiting_receiving etc. read as saved); drafts and cancelled do not count.
create or replace function public.procurement_apply_plan(p_snapshot_id uuid, p_supplier_id uuid default null::uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_today date := (now() at time zone 'Asia/Aqtobe')::date;
  v_updated integer;
  v_nil constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if not pg_try_advisory_xact_lock(hashtext('procurement_apply_plan:' || p_snapshot_id::text || ':' || coalesce(p_supplier_id::text, 'all'))) then
    return 0;
  end if;

  perform set_config('app.items_guard_skip', '1', true);

  with sup as (
    select distinct i.platform_supplier_id as sid
    from public.procurement_snapshot_items i
    where i.snapshot_id = p_snapshot_id
      and (p_supplier_id is null or i.platform_supplier_id = p_supplier_id)
  ),
  params as materialized (
    select coalesce(s.sid, v_nil) as sid_key, vp.target_days, vp.lead_days, vp.cycle_days, vp.basis
    from sup s
    left join public.procurement_supplier_plans pl
      on pl.snapshot_id = p_snapshot_id and pl.supplier_id = s.sid
    cross join lateral public.procurement_visit_params(s.sid, v_today, pl.delivery_date, pl.safety_days, pl.skip_cycles) vp
  ),
  transit as materialized (
    select poi.barcode, sum(poi.ordered_qty) as qty
    from public.purchase_order_items poi
    join public.purchase_orders po on po.id = poi.purchase_order_id
    where po.status in ('saved', 'awaiting_receiving', 'formed', 'sent', 'partially_received')
      and po.expected_delivery_date >= v_today
    group by poi.barcode
  ),
  calc as (
    select i.id, pr.target_days, pr.lead_days, pr.cycle_days, pr.basis,
      coalesce(t.qty, 0) as transit,
      case when i.avg_daily <= 0 then 0
        else greatest(0, round(i.avg_daily * pr.target_days - i.calculation_stock - coalesce(t.qty, 0))) end as rec,
      case
        when i.avg_daily <= 0 then 'no_demand'
        when i.calculation_stock + coalesce(t.qty, 0) < i.avg_daily * pr.target_days then 'under_norm'
        when i.calculation_stock + coalesce(t.qty, 0) > i.avg_daily * (pr.target_days + pr.cycle_days) then 'over_norm'
        else 'on_norm' end as status,
      (i.manual_override or i.generated_purchase_order_id is not null) as keep_final,
      i.final_order_qty as cur_final
    from public.procurement_snapshot_items i
    join params pr on pr.sid_key = coalesce(i.platform_supplier_id, v_nil)
    left join transit t on t.barcode = i.barcode
    where i.snapshot_id = p_snapshot_id
  )
  update public.procurement_snapshot_items i
  set target_days = c.target_days,
      lead_days = c.lead_days,
      cycle_days = c.cycle_days,
      plan_basis = c.basis,
      in_transit_qty = c.transit,
      recommended_qty = c.rec,
      final_order_qty = case when c.keep_final then c.cur_final else c.rec end,
      plan_status = c.status
  from calc c
  where i.id = c.id
    and (i.target_days is distinct from c.target_days
      or i.lead_days is distinct from c.lead_days
      or i.cycle_days is distinct from c.cycle_days
      or i.plan_basis is distinct from c.basis
      or i.in_transit_qty is distinct from c.transit
      or i.recommended_qty is distinct from c.rec
      or i.plan_status is distinct from c.status
      or (not c.keep_final and c.cur_final is distinct from c.rec));
  get diagnostics v_updated = row_count;

  perform set_config('app.items_guard_skip', '0', true);

  update public.procurement_snapshots s
  set orderable_count = (
    select count(*) from public.procurement_snapshot_items i
    where i.snapshot_id = p_snapshot_id and i.recommended_qty > 0)
  where s.id = p_snapshot_id;

  return v_updated;
end;
$function$;
