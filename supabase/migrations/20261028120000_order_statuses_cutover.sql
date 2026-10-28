-- Stage 25b (part 1, no deletions): cut over to the two statuses.
-- Docs: docs/db/stage-25-order-statuses/
-- 1) «Сверено» goes through a server function: the old direct UPDATE was refused by RLS for orders from the planner (0 marks ever set).
-- 2) Orders from «Закуп» are created as «saved» with no receiving documents.
-- 3) «В пути» counts saved orders only.
-- 4) Legacy statuses become «saved».

create or replace function public.procurement_set_order_checked(p_order_id uuid, p_checked boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.purchase_orders;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Требуется вход в систему' using errcode = '42501';
  end if;
  if not (auth_private.current_user_has_permission('receiving.view')
          or auth_private.current_user_has_permission('procurement.edit')) then
    raise exception 'Недостаточно прав для отметки «Сверено»' using errcode = '42501';
  end if;

  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if not found then
    raise exception 'Заказ не найден' using errcode = '22004';
  end if;
  if v_order.status in ('draft', 'cancelled') then
    raise exception 'Отметить можно только сохранённый заказ' using errcode = '55000';
  end if;

  if coalesce(p_checked, false) then
    select coalesce(nullif(btrim(au.full_name), ''), au.login) into v_name
    from public.academy_users au where au.auth_user_id = auth.uid();

    update public.purchase_orders
       set checked_at = now(), checked_by_name = v_name, updated_at = now()
     where id = p_order_id;
  else
    update public.purchase_orders
       set checked_at = null, checked_by_name = null, updated_at = now()
     where id = p_order_id;
  end if;

  return jsonb_build_object('order_id', p_order_id, 'checked', coalesce(p_checked, false));
end;
$function$;

revoke all on function public.procurement_set_order_checked(uuid, boolean) from public, anon;
grant execute on function public.procurement_set_order_checked(uuid, boolean) to authenticated;

create or replace function public.generate_procurement_orders_from_snapshot(p_snapshot_id uuid, p_expected_delivery_date date, p_supplier_ids uuid[], p_created_by text default null::text, p_created_by_name text default null::text, p_attempt_key uuid default null::uuid, p_payload_fingerprint text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_snapshot public.procurement_snapshots%rowtype;
  v_supplier record;
  v_item record;
  v_existing public.purchase_orders%rowtype;
  v_order_id uuid;
  v_po_item_id uuid;
  v_attempt_key uuid;
  v_client_fp text;
  v_server_fp text;
  v_items_payload jsonb;
  v_now timestamptz := now();
  v_today date := (timezone('Asia/Almaty', now()))::date;
  v_requested_supplier_ids uuid[];
  v_order_ids uuid[] := '{}';
  v_skipped_no_supplier integer := 0;
  v_orders_created integer := 0;
  v_orders_existing integer := 0;
  v_items_ordered integer := 0;
  v_total_amount numeric(14, 2);
  v_items_count integer;
  v_has_generated boolean := false;
  v_has_remaining boolean := false;
  v_remaining_suppliers integer := 0;
  v_next_status text;
  v_replay boolean := false;
begin
  if p_snapshot_id is null then
    raise exception 'snapshot_id required' using errcode = '22023';
  end if;
  if p_expected_delivery_date is null then
    raise exception 'expected_delivery_date required' using errcode = '22023';
  end if;

  v_client_fp := nullif(btrim(coalesce(p_payload_fingerprint, '')), '');

  if p_attempt_key is not null and v_client_fp is null then
    raise exception 'attempt_key requires payload fingerprint' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct supplier_id), '{}'::uuid[])
    into v_requested_supplier_ids
  from unnest(coalesce(p_supplier_ids, '{}'::uuid[])) as requested(supplier_id)
  where supplier_id is not null;

  if cardinality(v_requested_supplier_ids) = 0 then
    raise exception 'supplier selection is required' using errcode = '22023';
  end if;

  if p_attempt_key is not null and cardinality(v_requested_supplier_ids) <> 1 then
    raise exception 'attempt_key requires a single supplier' using errcode = '22023';
  end if;

  select *
    into v_snapshot
  from public.procurement_snapshots
  where id = p_snapshot_id
  for update;

  if not found then
    raise exception 'snapshot not found' using errcode = 'P0002';
  end if;

  if v_snapshot.status not in ('ready', 'partially_generated', 'generated') then
    raise exception 'snapshot is not available for generation (current: %)', v_snapshot.status
      using errcode = 'P0001';
  end if;

  select count(*)::integer
    into v_skipped_no_supplier
  from public.procurement_snapshot_items as i
  where i.snapshot_id = p_snapshot_id
    and i.final_order_qty > 0
    and i.platform_supplier_id is null;

  for v_supplier in
    select
      i.platform_supplier_id as supplier_id,
      coalesce(
        nullif(max(ps.name), ''),
        nullif(max(i.umag_supplier_name), ''),
        'Поставщик'
      ) as supplier_name
    from public.procurement_snapshot_items as i
    left join public.platform_suppliers as ps on ps.id = i.platform_supplier_id
    where i.snapshot_id = p_snapshot_id
      and i.platform_supplier_id is not null
      and i.platform_supplier_id = any (v_requested_supplier_ids)
    group by i.platform_supplier_id
    order by supplier_name, i.platform_supplier_id
  loop
    v_attempt_key := coalesce(
      p_attempt_key,
      auth_private.procurement_legacy_attempt_key(
        p_snapshot_id,
        v_snapshot.revision,
        v_supplier.supplier_id
      )
    );

    select *
      into v_existing
    from public.purchase_orders as po
    where po.attempt_key = v_attempt_key
      and po.workflow_mode = 'analytics'
      and po.status <> 'cancelled'
    for update;

    if found then
      if v_existing.source_snapshot_id is distinct from p_snapshot_id
         or v_existing.supplier_id is distinct from v_supplier.supplier_id
         or v_existing.expected_delivery_date is distinct from p_expected_delivery_date
      then
        raise exception 'attempt_key payload conflict'
          using errcode = 'P0001';
      end if;

      if p_attempt_key is not null
         and v_client_fp is distinct from v_existing.generation_payload_fingerprint
      then
        raise exception 'attempt_key payload conflict'
          using errcode = 'P0001';
      end if;

      v_orders_existing := v_orders_existing + 1;
      v_replay := true;
      v_order_ids := array_append(v_order_ids, v_existing.id);
      continue;
    end if;

    perform 1
    from public.procurement_snapshot_items as i
    where i.snapshot_id = p_snapshot_id
      and i.platform_supplier_id = v_supplier.supplier_id
    for update;

    select
      coalesce(sum(i.final_order_qty * i.purchase_price), 0)::numeric(14, 2),
      count(*)::integer,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'barcode', locked.barcode,
              'price', to_jsonb(locked.purchase_price),
              'qty', to_jsonb(locked.final_order_qty)
            )
            order by locked.barcode
          )
          from public.procurement_snapshot_items as locked
          where locked.snapshot_id = p_snapshot_id
            and locked.platform_supplier_id = v_supplier.supplier_id
            and locked.final_order_qty > 0
        ),
        '[]'::jsonb
      )
    into v_total_amount, v_items_count, v_items_payload
    from public.procurement_snapshot_items as i
    where i.snapshot_id = p_snapshot_id
      and i.platform_supplier_id = v_supplier.supplier_id
      and i.final_order_qty > 0;

    if v_items_count = 0 then
      continue;
    end if;

    v_server_fp := auth_private.procurement_attempt_fingerprint(
      p_snapshot_id,
      v_supplier.supplier_id,
      p_expected_delivery_date,
      v_items_payload
    );

    if p_attempt_key is not null and v_client_fp is distinct from v_server_fp then
      raise exception 'attempt_key payload conflict'
        using errcode = 'P0001';
    end if;

    v_order_id := gen_random_uuid();

    begin
      insert into public.purchase_orders (
        id,
        supplier_id,
        supplier_name,
        status,
        purchase_date,
        expected_delivery_date,
        total_amount,
        items_count,
        created_by,
        created_by_name,
        comment,
        transferred_to_receiving,
        receiving_document_id,
        workflow_mode,
        source_snapshot_id,
        source_snapshot_revision,
        attempt_key,
        generation_payload_fingerprint,
        created_at,
        updated_at
      ) values (
        v_order_id,
        v_supplier.supplier_id,
        v_supplier.supplier_name,
        'saved',
        v_today,
        p_expected_delivery_date,
        v_total_amount,
        v_items_count,
        p_created_by,
        p_created_by_name,
        '',
        false,
        null,
        'analytics',
        p_snapshot_id,
        v_snapshot.revision,
        v_attempt_key,
        coalesce(v_client_fp, v_server_fp),
        v_now,
        v_now
      );
    exception
      when unique_violation then
        select *
          into v_existing
        from public.purchase_orders as po
        where po.attempt_key = v_attempt_key
          and po.workflow_mode = 'analytics'
          and po.status <> 'cancelled'
        for update;

        if not found then
          raise;
        end if;

        if v_existing.source_snapshot_id is distinct from p_snapshot_id
           or v_existing.supplier_id is distinct from v_supplier.supplier_id
           or v_existing.expected_delivery_date is distinct from p_expected_delivery_date
           or (
             p_attempt_key is not null
             and v_client_fp is distinct from v_existing.generation_payload_fingerprint
           )
        then
          raise exception 'attempt_key payload conflict'
            using errcode = 'P0001';
        end if;

        v_orders_existing := v_orders_existing + 1;
        v_replay := true;
        v_order_ids := array_append(v_order_ids, v_existing.id);
        continue;
    end;

    for v_item in
      select *
      from public.procurement_snapshot_items as i
      where i.snapshot_id = p_snapshot_id
        and i.platform_supplier_id = v_supplier.supplier_id
        and i.final_order_qty > 0
      order by i.product_name, i.barcode
    loop
      v_po_item_id := gen_random_uuid();

      insert into public.purchase_order_items (
        id,
        purchase_order_id,
        product_name,
        barcode,
        supplier_id,
        supplier_name,
        stock_qty,
        sales_per_day,
        recommended_qty,
        ordered_qty,
        purchase_price,
        total_amount,
        comment,
        created_at,
        updated_at
      ) values (
        v_po_item_id,
        v_order_id,
        v_item.product_name,
        v_item.barcode,
        v_supplier.supplier_id,
        v_supplier.supplier_name,
        v_item.calculation_stock,
        v_item.avg_daily,
        v_item.recommended_qty,
        v_item.final_order_qty,
        v_item.purchase_price,
        round((v_item.final_order_qty * v_item.purchase_price)::numeric, 2),
        '',
        v_now,
        v_now
      );

      update public.procurement_snapshot_items
      set
        generated_purchase_order_id = v_order_id,
        final_order_qty = 0,
        manual_override = true,
        updated_at = v_now
      where id = v_item.id;

      v_items_ordered := v_items_ordered + 1;
    end loop;

    if not exists (
      select 1
      from public.purchase_order_items as poi
      where poi.purchase_order_id = v_order_id
    ) then
      raise exception 'cannot create an order without items'
        using errcode = 'P0001';
    end if;

    v_orders_created := v_orders_created + 1;
    v_order_ids := array_append(v_order_ids, v_order_id);
  end loop;

  select exists (
    select 1
    from public.purchase_orders as po
    where po.source_snapshot_id = p_snapshot_id
      and po.workflow_mode = 'analytics'
  ) into v_has_generated;

  select exists (
    select 1
    from public.procurement_snapshot_items as remaining
    where remaining.snapshot_id = p_snapshot_id
      and remaining.final_order_qty > 0
      and remaining.platform_supplier_id is not null
  ) into v_has_remaining;

  if v_has_generated and v_has_remaining then
    v_next_status := 'partially_generated';
  elsif v_has_generated then
    v_next_status := 'generated';
  else
    v_next_status := 'ready';
  end if;

  select count(distinct remaining.platform_supplier_id)::integer
    into v_remaining_suppliers
  from public.procurement_snapshot_items as remaining
  where remaining.snapshot_id = p_snapshot_id
    and remaining.final_order_qty > 0
    and remaining.platform_supplier_id is not null;

  update public.procurement_snapshots
  set
    status = v_next_status,
    generated_at = case
      when v_has_generated then coalesce(generated_at, v_now)
      else generated_at
    end,
    updated_at = v_now
  where id = p_snapshot_id;

  return jsonb_build_object(
    'success', true,
    'already_generated', v_orders_created = 0 and v_orders_existing > 0,
    'idempotent_replay', v_replay and v_orders_created = 0,
    'snapshot_id', p_snapshot_id,
    'snapshot_revision', v_snapshot.revision,
    'snapshot_status', v_next_status,
    'requested_supplier_ids', to_jsonb(v_requested_supplier_ids),
    'attempt_key', p_attempt_key,
    'payload_fingerprint', v_client_fp,
    'purchase_order_ids', to_jsonb(v_order_ids),
    'receiving_document_ids', '[]'::jsonb,
    'orders_created', v_orders_created,
    'orders_existing', v_orders_existing,
    'skipped_no_supplier', v_skipped_no_supplier,
    'items_ordered', v_items_ordered,
    'remaining_suppliers', v_remaining_suppliers,
    'nothing_to_order', v_orders_created = 0 and v_items_ordered = 0 and v_orders_existing = 0
  );
end;
$function$;

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
    where po.status = 'saved'
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

update public.purchase_orders
   set status = 'saved',
       transferred_to_receiving = false
 where status in ('awaiting_receiving', 'received', 'formed', 'sent', 'partially_received');
