-- Procurement Planning v1: UMAG stock/sales snapshots → analytics purchase + receiving.
-- Facts snapshots are immutable; refresh always creates a new snapshot.
-- Generate RPC is service_role-only (called from Edge Function).

select pg_advisory_xact_lock(202608090710);

create schema if not exists auth_private;

-- ---------------------------------------------------------------------------
-- procurement_snapshots
-- ---------------------------------------------------------------------------

create table if not exists public.procurement_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'syncing'
    check (status in ('syncing', 'ready', 'failed', 'generated')),
  period_from date not null,
  period_to date not null,
  synced_at timestamptz,
  generated_at timestamptz,
  created_by text,
  created_by_name text,
  item_count integer not null default 0,
  negative_stock_count integer not null default 0,
  orderable_count integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.procurement_snapshots is
  'Immutable UMAG planning snapshots (stock + 8-week sales). Refresh creates a new row.';

create index if not exists idx_procurement_snapshots_status_created
  on public.procurement_snapshots (status, created_at desc);

-- ---------------------------------------------------------------------------
-- procurement_snapshot_items
-- ---------------------------------------------------------------------------

create table if not exists public.procurement_snapshot_items (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.procurement_snapshots(id) on delete cascade,
  barcode text not null,
  product_name text not null default '',
  category_id text,
  category_name text not null default '',
  subcategory_name text not null default '',
  umag_supplier_id bigint,
  umag_supplier_name text not null default '',
  platform_supplier_id uuid references public.platform_suppliers(id) on delete set null,
  measure text not null default '',
  raw_stock numeric(14, 3) not null default 0,
  calculation_stock numeric(14, 3) not null default 0,
  negative_stock boolean not null default false,
  weekly_sales numeric(14, 3)[] not null default '{}',
  sales_8w numeric(14, 3) not null default 0,
  avg_daily numeric(14, 6) not null default 0,
  purchase_price numeric(14, 2) not null default 0,
  selling_price numeric(14, 2) not null default 0,
  norm_days integer not null default 14 check (norm_days >= 0),
  recommended_qty numeric(14, 3) not null default 0 check (recommended_qty >= 0),
  final_order_qty numeric(14, 3) not null default 0 check (final_order_qty >= 0),
  manual_override boolean not null default false,
  generated_purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (snapshot_id, barcode)
);

comment on table public.procurement_snapshot_items is
  'Per-SKU planning rows for a snapshot. Fact columns are immutable after sync.';

create index if not exists idx_psi_snapshot_category
  on public.procurement_snapshot_items (snapshot_id, category_name);
create index if not exists idx_psi_snapshot_subcategory
  on public.procurement_snapshot_items (snapshot_id, subcategory_name);
create index if not exists idx_psi_snapshot_supplier
  on public.procurement_snapshot_items (snapshot_id, platform_supplier_id);
create index if not exists idx_psi_snapshot_umag_supplier
  on public.procurement_snapshot_items (snapshot_id, umag_supplier_id);
create index if not exists idx_psi_snapshot_final_qty
  on public.procurement_snapshot_items (snapshot_id, final_order_qty);
create index if not exists idx_psi_snapshot_barcode
  on public.procurement_snapshot_items (snapshot_id, barcode);
create index if not exists idx_psi_snapshot_product_name
  on public.procurement_snapshot_items (snapshot_id, product_name);
create index if not exists idx_psi_snapshot_negative
  on public.procurement_snapshot_items (snapshot_id, negative_stock)
  where negative_stock = true;
create index if not exists idx_psi_snapshot_generated_po
  on public.procurement_snapshot_items (snapshot_id, generated_purchase_order_id);

-- Standalone FK covering indexes (PostgREST/advisors).
create index if not exists idx_psi_platform_supplier_id
  on public.procurement_snapshot_items (platform_supplier_id);
create index if not exists idx_psi_generated_purchase_order_id
  on public.procurement_snapshot_items (generated_purchase_order_id);

-- ---------------------------------------------------------------------------
-- procurement_norm_rules
-- ---------------------------------------------------------------------------

create table if not exists public.procurement_norm_rules (
  id uuid primary key default gen_random_uuid(),
  category_name text not null default '',
  subcategory_name text not null default '',
  norm_days integer not null default 14 check (norm_days >= 0),
  updated_by text,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint procurement_norm_rules_key_unique unique (category_name, subcategory_name)
);

comment on table public.procurement_norm_rules is
  'Buyer norm days by category/subcategory. Empty subcategory = category-level rule.';

create index if not exists idx_procurement_norm_rules_category
  on public.procurement_norm_rules (category_name);

-- ---------------------------------------------------------------------------
-- Protect fact columns on snapshot items (authenticated may edit planning fields)
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

  -- Fact / identity fields are immutable after insert.
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

  -- Linkage may be set once during generate; never reassigned to a different order.
  if old.generated_purchase_order_id is not null
     and new.generated_purchase_order_id is distinct from old.generated_purchase_order_id
  then
    raise exception 'procurement_snapshot_items: generated_purchase_order_id is immutable once set'
      using errcode = '42501';
  end if;

  -- Planning edits only while snapshot is ready.
  -- Lock snapshot FOR SHARE so concurrent generate (FOR UPDATE) serializes the race.
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

    if not found or v_snapshot_status is distinct from 'ready' then
      raise exception 'procurement_snapshot_items: planning fields editable only when snapshot status is ready'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_procurement_snapshot_items_guard_update
  on public.procurement_snapshot_items;
create trigger trg_procurement_snapshot_items_guard_update
  before update on public.procurement_snapshot_items
  for each row
  execute function public.procurement_snapshot_items_guard_update();

-- ---------------------------------------------------------------------------
-- Atomic generate: group by platform_supplier_id → purchase + receiving
-- ---------------------------------------------------------------------------

create or replace function public.generate_procurement_orders_from_snapshot(
  p_snapshot_id uuid,
  p_expected_delivery_date date,
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
  v_order_ids uuid[] := '{}';
  v_receiving_ids uuid[] := '{}';
  v_skipped_no_supplier integer := 0;
  v_orders_created integer := 0;
  v_items_ordered integer := 0;
  v_total_amount numeric(14, 2);
  v_items_count integer;
  v_total_ordered_qty numeric(14, 3);
  v_existing_ids uuid[];
begin
  if p_snapshot_id is null then
    raise exception 'snapshot_id required' using errcode = '22023';
  end if;
  if p_expected_delivery_date is null then
    raise exception 'expected_delivery_date required' using errcode = '22023';
  end if;

  select * into v_snapshot
  from public.procurement_snapshots
  where id = p_snapshot_id
  for update;

  if not found then
    raise exception 'snapshot not found' using errcode = 'P0002';
  end if;

  -- Idempotent: already generated → return existing linked orders.
  if v_snapshot.status = 'generated' then
    select coalesce(array_agg(distinct generated_purchase_order_id)
                      filter (where generated_purchase_order_id is not null), '{}')
      into v_existing_ids
    from public.procurement_snapshot_items
    where snapshot_id = p_snapshot_id;

    select coalesce(array_agg(rd.id), '{}')
      into v_receiving_ids
    from public.receiving_documents rd
    where rd.purchase_order_id = any (v_existing_ids);

    return jsonb_build_object(
      'success', true,
      'already_generated', true,
      'snapshot_id', p_snapshot_id,
      'purchase_order_ids', to_jsonb(coalesce(v_existing_ids, '{}'::uuid[])),
      'receiving_document_ids', to_jsonb(coalesce(v_receiving_ids, '{}'::uuid[])),
      'orders_created', 0,
      'skipped_no_supplier', 0,
      'items_ordered', 0
    );
  end if;

  if v_snapshot.status <> 'ready' then
    raise exception 'snapshot must be ready (current: %)', v_snapshot.status
      using errcode = 'P0001';
  end if;

  select count(*)::integer into v_skipped_no_supplier
  from public.procurement_snapshot_items i
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
    from public.procurement_snapshot_items i
    left join public.platform_suppliers ps on ps.id = i.platform_supplier_id
    where i.snapshot_id = p_snapshot_id
      and i.final_order_qty > 0
      and i.platform_supplier_id is not null
    group by i.platform_supplier_id
    order by supplier_name
  loop
    select
      coalesce(sum(i.final_order_qty * i.purchase_price), 0)::numeric(14, 2),
      count(*)::integer,
      coalesce(sum(i.final_order_qty), 0)::numeric(14, 3)
    into v_total_amount, v_items_count, v_total_ordered_qty
    from public.procurement_snapshot_items i
    where i.snapshot_id = p_snapshot_id
      and i.platform_supplier_id = v_supplier.supplier_id
      and i.final_order_qty > 0;

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
      from public.procurement_snapshot_items i
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
      set generated_purchase_order_id = v_order_id,
          updated_at = v_now
      where id = v_item.id;

      v_items_ordered := v_items_ordered + 1;
    end loop;

    v_order_ids := array_append(v_order_ids, v_order_id);
    v_receiving_ids := array_append(v_receiving_ids, v_receiving_id);
    v_orders_created := v_orders_created + 1;
  end loop;

  if v_orders_created > 0 then
    update public.procurement_snapshots
    set status = 'generated',
        generated_at = v_now,
        updated_at = v_now,
        orderable_count = v_items_ordered
    where id = p_snapshot_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'already_generated', false,
    'snapshot_id', p_snapshot_id,
    'purchase_order_ids', to_jsonb(v_order_ids),
    'receiving_document_ids', to_jsonb(v_receiving_ids),
    'orders_created', v_orders_created,
    'skipped_no_supplier', v_skipped_no_supplier,
    'items_ordered', v_items_ordered
  );
end;
$$;

comment on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) is
  'Atomically create analytics purchase_orders + receiving_documents from a ready snapshot. service_role only.';

revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) from public;
revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) from anon;
revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) from authenticated;
grant execute on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Atomic norm rule + set-based snapshot update (authenticated, procurement.edit)
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
  -- Authz is enforced by Edge (procurement.edit) + EXECUTE grant service_role only.
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

  if v_snapshot.status is distinct from 'ready' then
    raise exception 'snapshot must be ready' using errcode = 'P0001';
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
    and i.category_name = v_cat
    and (
      (v_sub <> '' and i.subcategory_name = v_sub)
      or (v_sub = '')
    );

  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'success', true,
    'snapshot_id', p_snapshot_id,
    'category_name', v_cat,
    'subcategory_name', v_sub,
    'norm_days', v_days,
    'updated_rows', v_updated
  );
end;
$$;

comment on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) is
  'Upsert norm rule and set-based snapshot update. service_role only; Edge enforces procurement.edit; snapshot must be ready.';

revoke all on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) from public;
revoke all on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) from anon;
revoke all on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) from authenticated;
grant execute on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- RLS + GRANTs
-- Read: procurement.view|edit|create
-- Norm writes: Edge action set_norm → service_role RPC
-- Column-level UPDATE on snapshot items: final_order_qty/manual_override/updated_at only
-- anon none; service_role all
-- ---------------------------------------------------------------------------

alter table public.procurement_snapshots enable row level security;
alter table public.procurement_snapshot_items enable row level security;
alter table public.procurement_norm_rules enable row level security;

revoke all on table public.procurement_snapshots from public;
revoke all on table public.procurement_snapshots from anon;
revoke all on table public.procurement_snapshots from authenticated;
revoke all on table public.procurement_snapshot_items from public;
revoke all on table public.procurement_snapshot_items from anon;
revoke all on table public.procurement_snapshot_items from authenticated;
revoke all on table public.procurement_norm_rules from public;
revoke all on table public.procurement_norm_rules from anon;
revoke all on table public.procurement_norm_rules from authenticated;

grant select on table public.procurement_snapshots to authenticated;
grant select on table public.procurement_snapshot_items to authenticated;
grant update (
  final_order_qty,
  manual_override,
  updated_at
) on table public.procurement_snapshot_items to authenticated;
grant select on table public.procurement_norm_rules to authenticated;

grant all on table public.procurement_snapshots to service_role;
grant all on table public.procurement_snapshot_items to service_role;
grant all on table public.procurement_norm_rules to service_role;

drop policy if exists procurement_snapshots_select_active_employee on public.procurement_snapshots;
drop policy if exists procurement_snapshots_select_view on public.procurement_snapshots;
create policy procurement_snapshots_select_view
  on public.procurement_snapshots
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('procurement.view')
    or auth_private.current_user_has_permission('procurement.edit')
    or auth_private.current_user_has_permission('procurement.create')
  );

drop policy if exists procurement_snapshot_items_select_active_employee on public.procurement_snapshot_items;
drop policy if exists procurement_snapshot_items_select_view on public.procurement_snapshot_items;
create policy procurement_snapshot_items_select_view
  on public.procurement_snapshot_items
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('procurement.view')
    or auth_private.current_user_has_permission('procurement.edit')
    or auth_private.current_user_has_permission('procurement.create')
  );

drop policy if exists procurement_snapshot_items_update_active_employee on public.procurement_snapshot_items;
drop policy if exists procurement_snapshot_items_update_edit on public.procurement_snapshot_items;
create policy procurement_snapshot_items_update_edit
  on public.procurement_snapshot_items
  for update
  to authenticated
  using (
    auth_private.current_user_has_permission('procurement.edit')
    and exists (
      select 1
      from public.procurement_snapshots as s
      where s.id = procurement_snapshot_items.snapshot_id
        and s.status = 'ready'
    )
  )
  with check (
    auth_private.current_user_has_permission('procurement.edit')
    and exists (
      select 1
      from public.procurement_snapshots as s
      where s.id = procurement_snapshot_items.snapshot_id
        and s.status = 'ready'
    )
  );

drop policy if exists procurement_norm_rules_select_active_employee on public.procurement_norm_rules;
drop policy if exists procurement_norm_rules_select_view on public.procurement_norm_rules;
create policy procurement_norm_rules_select_view
  on public.procurement_norm_rules
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('procurement.view')
    or auth_private.current_user_has_permission('procurement.edit')
    or auth_private.current_user_has_permission('procurement.create')
  );

drop policy if exists procurement_norm_rules_insert_active_employee on public.procurement_norm_rules;
drop policy if exists procurement_norm_rules_insert_edit on public.procurement_norm_rules;
create policy procurement_norm_rules_insert_edit
  on public.procurement_norm_rules
  for insert
  to authenticated
  with check (auth_private.current_user_has_permission('procurement.edit'));

drop policy if exists procurement_norm_rules_update_active_employee on public.procurement_norm_rules;
drop policy if exists procurement_norm_rules_update_edit on public.procurement_norm_rules;
create policy procurement_norm_rules_update_edit
  on public.procurement_norm_rules
  for update
  to authenticated
  using (auth_private.current_user_has_permission('procurement.edit'))
  with check (auth_private.current_user_has_permission('procurement.edit'));

drop policy if exists procurement_norm_rules_delete_active_employee on public.procurement_norm_rules;
drop policy if exists procurement_norm_rules_delete_edit on public.procurement_norm_rules;
create policy procurement_norm_rules_delete_edit
  on public.procurement_norm_rules
  for delete
  to authenticated
  using (auth_private.current_user_has_permission('procurement.edit'));

notify pgrst, 'reload schema';
