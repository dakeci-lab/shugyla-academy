-- Partial supplier generation for procurement planning.
-- A synchronized snapshot remains a working document until every supplier order
-- has been generated. Generated supplier rows are immutable; all remaining rows
-- can still be planned and generated independently.

select pg_advisory_xact_lock(20260810160315);

-- ---------------------------------------------------------------------------
-- Snapshot/order lineage and lifecycle
-- ---------------------------------------------------------------------------

alter table public.procurement_snapshots
  drop constraint if exists procurement_snapshots_status_check;

alter table public.procurement_snapshots
  add constraint procurement_snapshots_status_check
  check (status in ('syncing', 'ready', 'failed', 'partially_generated', 'generated'));

alter table public.procurement_snapshots
  add column if not exists revision integer not null default 1;

alter table public.procurement_snapshots
  drop constraint if exists procurement_snapshots_revision_check;

alter table public.procurement_snapshots
  add constraint procurement_snapshots_revision_check
  check (revision > 0);

alter table public.purchase_orders
  add column if not exists source_snapshot_id uuid
    references public.procurement_snapshots(id) on delete restrict,
  add column if not exists source_snapshot_revision integer;

alter table public.purchase_orders
  drop constraint if exists purchase_orders_source_snapshot_pair_check;

alter table public.purchase_orders
  add constraint purchase_orders_source_snapshot_pair_check
  check (
    (source_snapshot_id is null and source_snapshot_revision is null)
    or (
      source_snapshot_id is not null
      and source_snapshot_revision is not null
      and source_snapshot_revision > 0
    )
  );

-- Recover lineage for orders created before the explicit columns existed.
-- DISTINCT ON is defensive: a generated order should belong to exactly one
-- snapshot, but old data is kept even if it contains an inconsistent link.
with legacy_links as (
  select distinct on (i.generated_purchase_order_id)
    i.generated_purchase_order_id as purchase_order_id,
    i.snapshot_id,
    s.revision
  from public.procurement_snapshot_items as i
  join public.procurement_snapshots as s on s.id = i.snapshot_id
  where i.generated_purchase_order_id is not null
  order by i.generated_purchase_order_id, i.created_at desc, i.snapshot_id
)
update public.purchase_orders as po
set
  source_snapshot_id = legacy_links.snapshot_id,
  source_snapshot_revision = legacy_links.revision
from legacy_links
where po.id = legacy_links.purchase_order_id
  and po.source_snapshot_id is null;

create index if not exists idx_purchase_orders_source_snapshot
  on public.purchase_orders (source_snapshot_id, source_snapshot_revision, created_at desc)
  where source_snapshot_id is not null;

-- One supplier can have only one order in a particular snapshot revision.
-- Legacy/simple orders have no source_snapshot_id and are not affected.
create unique index if not exists uq_purchase_orders_snapshot_revision_supplier
  on public.purchase_orders (
    source_snapshot_id,
    source_snapshot_revision,
    supplier_id
  )
  where source_snapshot_id is not null
    and source_snapshot_revision is not null
    and supplier_id is not null
    and workflow_mode = 'analytics';

-- An old generated snapshot can become partially generated when historical data
-- contains unlinked, still-orderable suppliers. No rows or orders are deleted.
update public.procurement_snapshots as s
set
  status = case
    when exists (
      select 1
      from public.procurement_snapshot_items as remaining
      where remaining.snapshot_id = s.id
        and remaining.final_order_qty > 0
        and remaining.platform_supplier_id is not null
        and remaining.generated_purchase_order_id is null
    ) then 'partially_generated'
    else 'generated'
  end,
  updated_at = now()
where s.status = 'generated'
  and exists (
    select 1
    from public.procurement_snapshot_items as generated
    where generated.snapshot_id = s.id
      and generated.generated_purchase_order_id is not null
  );

-- ---------------------------------------------------------------------------
-- Planning guard: ungenerated rows remain editable in a partial snapshot
-- ---------------------------------------------------------------------------

create or replace function public.procurement_snapshot_items_guard_update()
returns trigger
language plpgsql
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

drop policy if exists procurement_snapshot_items_update_edit
  on public.procurement_snapshot_items;

create policy procurement_snapshot_items_update_edit
  on public.procurement_snapshot_items
  for update
  to authenticated
  using (
    auth_private.current_user_has_permission('procurement.edit')
    and procurement_snapshot_items.generated_purchase_order_id is null
    and exists (
      select 1
      from public.procurement_snapshots as s
      where s.id = procurement_snapshot_items.snapshot_id
        and s.status in ('ready', 'partially_generated')
    )
  )
  with check (
    auth_private.current_user_has_permission('procurement.edit')
    and procurement_snapshot_items.generated_purchase_order_id is null
    and exists (
      select 1
      from public.procurement_snapshots as s
      where s.id = procurement_snapshot_items.snapshot_id
        and s.status in ('ready', 'partially_generated')
    )
  );

-- ---------------------------------------------------------------------------
-- Atomic, idempotent generation for selected suppliers
-- ---------------------------------------------------------------------------

create or replace function public.generate_procurement_orders_from_snapshot(
  p_snapshot_id uuid,
  p_expected_delivery_date date,
  p_supplier_ids uuid[],
  p_created_by text default null,
  p_created_by_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot public.procurement_snapshots%rowtype;
  v_supplier record;
  v_item record;
  v_order_id uuid;
  v_receiving_id uuid;
  v_po_item_id uuid;
  v_now timestamptz := now();
  v_today date := (timezone('Asia/Almaty', now()))::date;
  v_requested_supplier_ids uuid[];
  v_order_ids uuid[] := '{}';
  v_receiving_ids uuid[] := '{}';
  v_skipped_no_supplier integer := 0;
  v_orders_created integer := 0;
  v_orders_existing integer := 0;
  v_items_ordered integer := 0;
  v_total_amount numeric(14, 2);
  v_items_count integer;
  v_total_ordered_qty numeric(14, 3);
  v_has_generated boolean := false;
  v_has_remaining boolean := false;
  v_remaining_suppliers integer := 0;
  v_next_status text;
begin
  if p_snapshot_id is null then
    raise exception 'snapshot_id required' using errcode = '22023';
  end if;
  if p_expected_delivery_date is null then
    raise exception 'expected_delivery_date required' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct supplier_id), '{}'::uuid[])
    into v_requested_supplier_ids
  from unnest(coalesce(p_supplier_ids, '{}'::uuid[])) as requested(supplier_id)
  where supplier_id is not null;

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
    and i.platform_supplier_id is null
    and i.generated_purchase_order_id is null;

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
      and i.final_order_qty > 0
      and i.platform_supplier_id is not null
      and i.generated_purchase_order_id is null
      and (
        cardinality(v_requested_supplier_ids) = 0
        or i.platform_supplier_id = any (v_requested_supplier_ids)
      )
    group by i.platform_supplier_id
    order by supplier_name, i.platform_supplier_id
  loop
    -- Snapshot row lock serializes concurrent generation. The unique index is a
    -- second line of defence against duplicates caused by future code changes.
    select po.id, po.receiving_document_id
      into v_order_id, v_receiving_id
    from public.purchase_orders as po
    where po.source_snapshot_id = p_snapshot_id
      and po.source_snapshot_revision = v_snapshot.revision
      and po.supplier_id = v_supplier.supplier_id
      and po.workflow_mode = 'analytics'
    limit 1;

    if found then
      continue;
    end if;

    select
      coalesce(sum(i.final_order_qty * i.purchase_price), 0)::numeric(14, 2),
      count(*)::integer,
      coalesce(sum(i.final_order_qty), 0)::numeric(14, 3)
    into v_total_amount, v_items_count, v_total_ordered_qty
    from public.procurement_snapshot_items as i
    where i.snapshot_id = p_snapshot_id
      and i.platform_supplier_id = v_supplier.supplier_id
      and i.final_order_qty > 0
      and i.generated_purchase_order_id is null;

    if v_items_count = 0 then
      continue;
    end if;

    v_order_id := gen_random_uuid();
    v_receiving_id := gen_random_uuid();

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
      created_at,
      updated_at
    ) values (
      v_order_id,
      v_supplier.supplier_id,
      v_supplier.supplier_name,
      'awaiting_receiving',
      v_today,
      p_expected_delivery_date,
      v_total_amount,
      v_items_count,
      p_created_by,
      p_created_by_name,
      'Сформировано из планирования закупок',
      true,
      v_receiving_id,
      'analytics',
      p_snapshot_id,
      v_snapshot.revision,
      v_now,
      v_now
    );

    insert into public.receiving_documents (
      id,
      purchase_order_id,
      supplier_id,
      supplier_name,
      status,
      expected_delivery_date,
      created_by,
      created_by_name,
      comment,
      total_ordered_qty,
      total_received_qty,
      total_difference_qty,
      total_amount,
      workflow_mode,
      created_at,
      updated_at
    ) values (
      v_receiving_id,
      v_order_id,
      v_supplier.supplier_id,
      v_supplier.supplier_name,
      'awaiting_receiving',
      p_expected_delivery_date,
      p_created_by,
      p_created_by_name,
      'Сформировано из планирования закупок',
      v_total_ordered_qty,
      0,
      -v_total_ordered_qty,
      v_total_amount,
      'analytics',
      v_now,
      v_now
    );

    for v_item in
      select *
      from public.procurement_snapshot_items as i
      where i.snapshot_id = p_snapshot_id
        and i.platform_supplier_id = v_supplier.supplier_id
        and i.final_order_qty > 0
        and i.generated_purchase_order_id is null
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

      insert into public.receiving_items (
        id,
        receiving_document_id,
        purchase_order_item_id,
        product_name,
        barcode,
        ordered_qty,
        received_qty,
        difference_qty,
        purchase_price,
        status,
        comment,
        created_at,
        updated_at
      ) values (
        gen_random_uuid(),
        v_receiving_id,
        v_po_item_id,
        v_item.product_name,
        v_item.barcode,
        v_item.final_order_qty,
        0,
        -v_item.final_order_qty,
        v_item.purchase_price,
        'pending',
        '',
        v_now,
        v_now
      );

      update public.procurement_snapshot_items
      set
        generated_purchase_order_id = v_order_id,
        updated_at = v_now
      where id = v_item.id;

      v_items_ordered := v_items_ordered + 1;
    end loop;

    v_orders_created := v_orders_created + 1;
  end loop;

  select exists (
    select 1
    from public.procurement_snapshot_items as generated
    where generated.snapshot_id = p_snapshot_id
      and generated.generated_purchase_order_id is not null
  ) into v_has_generated;

  select exists (
    select 1
    from public.procurement_snapshot_items as remaining
    where remaining.snapshot_id = p_snapshot_id
      and remaining.final_order_qty > 0
      and remaining.platform_supplier_id is not null
      and remaining.generated_purchase_order_id is null
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
    and remaining.platform_supplier_id is not null
    and remaining.generated_purchase_order_id is null;

  update public.procurement_snapshots
  set
    status = v_next_status,
    generated_at = case
      when v_has_generated then coalesce(generated_at, v_now)
      else generated_at
    end,
    updated_at = v_now
  where id = p_snapshot_id;

  select
    coalesce(array_agg(po.id order by po.created_at, po.id), '{}'::uuid[]),
    coalesce(
      array_agg(po.receiving_document_id order by po.created_at, po.id)
        filter (where po.receiving_document_id is not null),
      '{}'::uuid[]
    )
  into v_order_ids, v_receiving_ids
  from public.purchase_orders as po
  where po.source_snapshot_id = p_snapshot_id
    and po.source_snapshot_revision = v_snapshot.revision
    and po.workflow_mode = 'analytics'
    and (
      cardinality(v_requested_supplier_ids) = 0
      or po.supplier_id = any (v_requested_supplier_ids)
    );

  -- Existing count is intentionally derived from the total targeted result minus
  -- this transaction's inserts, avoiding timestamp edge cases.
  v_orders_existing := greatest(0, cardinality(v_order_ids) - v_orders_created);

  return jsonb_build_object(
    'success', true,
    'already_generated', v_orders_created = 0 and v_orders_existing > 0,
    'snapshot_id', p_snapshot_id,
    'snapshot_revision', v_snapshot.revision,
    'snapshot_status', v_next_status,
    'requested_supplier_ids', to_jsonb(v_requested_supplier_ids),
    'purchase_order_ids', to_jsonb(v_order_ids),
    'receiving_document_ids', to_jsonb(v_receiving_ids),
    'orders_created', v_orders_created,
    'orders_existing', v_orders_existing,
    'skipped_no_supplier', v_skipped_no_supplier,
    'items_ordered', v_items_ordered,
    'remaining_suppliers', v_remaining_suppliers
  );
end;
$$;

comment on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text) is
  'Idempotently create analytics purchase/receiving documents for selected, not-yet-generated suppliers. service_role only.';

revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text) from public;
revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text) from anon;
revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text) from authenticated;
grant execute on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text) to service_role;

-- Keep the old RPC signature as a secure compatibility wrapper. It now uses the
-- same partial/idempotent implementation and targets all remaining suppliers.
create or replace function public.generate_procurement_orders_from_snapshot(
  p_snapshot_id uuid,
  p_expected_delivery_date date,
  p_created_by text default null,
  p_created_by_name text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.generate_procurement_orders_from_snapshot(
    p_snapshot_id,
    p_expected_delivery_date,
    null::uuid[],
    p_created_by,
    p_created_by_name
  );
$$;

comment on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) is
  'Compatibility wrapper: idempotently generate all remaining suppliers. service_role only.';

revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) from public;
revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) from anon;
revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) from authenticated;
grant execute on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Norm changes recalculate only suppliers that have not been generated yet
-- ---------------------------------------------------------------------------

create or replace function public.set_procurement_norm_rule_for_snapshot(
  p_snapshot_id uuid,
  p_category_name text,
  p_subcategory_name text,
  p_norm_days integer,
  p_updated_by text default null,
  p_updated_by_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat text := coalesce(p_category_name, '');
  v_sub text := coalesce(p_subcategory_name, '');
  v_days integer;
  v_updated integer := 0;
  v_now timestamptz := now();
  v_snapshot public.procurement_snapshots%rowtype;
begin
  if p_snapshot_id is null then
    raise exception 'snapshot_id required' using errcode = '22023';
  end if;

  if p_norm_days is null or p_norm_days < 0 then
    raise exception 'norm_days must be >= 0' using errcode = '22023';
  end if;
  v_days := p_norm_days;

  select *
    into v_snapshot
  from public.procurement_snapshots
  where id = p_snapshot_id
  for update;

  if not found then
    raise exception 'snapshot not found' using errcode = 'P0002';
  end if;

  if v_snapshot.status not in ('ready', 'partially_generated') then
    raise exception 'snapshot must be a working snapshot' using errcode = 'P0001';
  end if;

  insert into public.procurement_norm_rules (
    category_name,
    subcategory_name,
    norm_days,
    updated_by,
    updated_by_name,
    updated_at
  ) values (
    v_cat,
    v_sub,
    v_days,
    p_updated_by,
    p_updated_by_name,
    v_now
  )
  on conflict (category_name, subcategory_name) do update
  set
    norm_days = excluded.norm_days,
    updated_by = excluded.updated_by,
    updated_by_name = excluded.updated_by_name,
    updated_at = excluded.updated_at;

  update public.procurement_snapshot_items as i
  set
    norm_days = v_days,
    recommended_qty = greatest(
      0,
      round((i.avg_daily * v_days - i.calculation_stock)::numeric, 0)
    ),
    final_order_qty = case
      when i.manual_override then i.final_order_qty
      else greatest(
        0,
        round((i.avg_daily * v_days - i.calculation_stock)::numeric, 0)
      )
    end,
    updated_at = v_now
  where i.snapshot_id = p_snapshot_id
    and i.generated_purchase_order_id is null
    and i.category_name = v_cat
    and (
      (v_sub <> '' and i.subcategory_name = v_sub)
      or v_sub = ''
    );

  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'success', true,
    'snapshot_id', p_snapshot_id,
    'snapshot_status', v_snapshot.status,
    'category_name', v_cat,
    'subcategory_name', v_sub,
    'norm_days', v_days,
    'updated_rows', v_updated
  );
end;
$$;

comment on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) is
  'Upsert a norm rule and update only ungenerated rows in a working snapshot. service_role only.';

revoke all on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) from public;
revoke all on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) from anon;
revoke all on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) from authenticated;
grant execute on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) to service_role;

notify pgrst, 'reload schema';
