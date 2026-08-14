-- Repeat analytics purchase orders for the same SKU + supplier inside one snapshot.
--
-- Root cause of the previous lock: generation treated
--   unique(snapshot, revision, supplier) + generated_purchase_order_id
-- as an exclusive "already ordered" flag. That made a conscious second order
-- of the same barcode impossible, even after the buyer reset quantity.
--
-- purchase_order_items remains the journal. procurement_snapshot_items stays
-- one planning row per unique(snapshot_id, barcode). generated_purchase_order_id
-- is kept as a last-order pointer only — it is no longer a write lock.

select pg_advisory_xact_lock(20260814134910);

-- ---------------------------------------------------------------------------
-- Columns and uniqueness
-- ---------------------------------------------------------------------------

alter table public.purchase_orders
  add column if not exists attempt_key uuid,
  add column if not exists generation_payload_fingerprint text;

comment on column public.purchase_orders.attempt_key is
  'Idempotency key for one analytics generation attempt. Repeat of the same key returns the same order; a new key creates a new order.';

comment on column public.purchase_orders.generation_payload_fingerprint is
  'Canonical source text spec shugyla.procurement.attempt.fp.v1 (snapshot, supplier, date, sorted barcode=qty). Same attempt_key with a different fingerprint is a conflict. Not a hash.';

comment on column public.procurement_snapshot_items.generated_purchase_order_id is
  'Backward-compatible pointer to the latest analytics order that consumed this planning row. Not an exclusive lock and not the full order history.';

drop index if exists public.uq_purchase_orders_snapshot_revision_supplier;
drop index if exists public.uq_purchase_orders_analytics_attempt_key;

create unique index if not exists uq_purchase_orders_analytics_attempt_key
  on public.purchase_orders (attempt_key)
  where workflow_mode = 'analytics'
    and attempt_key is not null
    and status <> 'cancelled';

create index if not exists idx_purchase_order_items_barcode
  on public.purchase_order_items (barcode)
  where barcode is not null and barcode <> '';

revoke update (
  attempt_key,
  generation_payload_fingerprint,
  source_snapshot_id,
  source_snapshot_revision
) on table public.purchase_orders from authenticated;

-- Table-level UPDATE would still allow those columns. Revoke table UPDATE and
-- re-grant only simple/manual fields. Lineage columns stay unggranted.
revoke insert, update on table public.purchase_orders from authenticated;
grant insert (
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
) on table public.purchase_orders to authenticated;
grant update (
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
  updated_at
) on table public.purchase_orders to authenticated;

revoke insert, update on table public.purchase_order_items from authenticated;
grant insert (
  id,
  purchase_order_id,
  product_name,
  barcode,
  unit,
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
) on table public.purchase_order_items to authenticated;
grant update (
  product_name,
  barcode,
  unit,
  supplier_id,
  supplier_name,
  stock_qty,
  sales_per_day,
  recommended_qty,
  ordered_qty,
  purchase_price,
  total_amount,
  comment,
  updated_at
) on table public.purchase_order_items to authenticated;

revoke insert, update on table public.receiving_documents from authenticated;
grant insert (
  id,
  purchase_order_id,
  supplier_id,
  supplier_name,
  status,
  expected_delivery_date,
  received_by,
  received_by_name,
  created_by,
  created_by_name,
  comment,
  total_ordered_qty,
  total_received_qty,
  total_difference_qty,
  total_amount,
  total_received_amount,
  supplier_invoice_numbers,
  version,
  started_at,
  completed_at,
  export_version,
  last_exported_at,
  last_exported_by,
  last_export_filename,
  workflow_mode,
  created_at,
  updated_at
) on table public.receiving_documents to authenticated;
grant update (
  purchase_order_id,
  supplier_id,
  supplier_name,
  status,
  expected_delivery_date,
  received_by,
  received_by_name,
  created_by,
  created_by_name,
  comment,
  total_ordered_qty,
  total_received_qty,
  total_difference_qty,
  total_amount,
  total_received_amount,
  supplier_invoice_numbers,
  version,
  started_at,
  completed_at,
  export_version,
  last_exported_at,
  last_exported_by,
  last_export_filename,
  updated_at
) on table public.receiving_documents to authenticated;

revoke insert, update on table public.receiving_items from authenticated;
grant insert (
  id,
  receiving_document_id,
  purchase_order_item_id,
  product_name,
  barcode,
  unit,
  ordered_qty,
  received_qty,
  difference_qty,
  purchase_price,
  actual_purchase_price,
  is_outside_order,
  discrepancy_reason,
  discrepancy_reason_code,
  photo_urls,
  photo_metadata,
  sort_order,
  status,
  comment,
  created_at,
  updated_at
) on table public.receiving_items to authenticated;
grant update (
  purchase_order_item_id,
  product_name,
  barcode,
  unit,
  ordered_qty,
  received_qty,
  difference_qty,
  purchase_price,
  actual_purchase_price,
  is_outside_order,
  discrepancy_reason,
  discrepancy_reason_code,
  photo_urls,
  photo_metadata,
  sort_order,
  status,
  comment,
  updated_at
) on table public.receiving_items to authenticated;

-- ---------------------------------------------------------------------------
-- Deterministic legacy attempt key (old clients that omit attempt_key)
-- ---------------------------------------------------------------------------

create or replace function auth_private.procurement_legacy_attempt_key(
  p_snapshot_id uuid,
  p_revision integer,
  p_supplier_id uuid
)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  h text;
begin
  if p_snapshot_id is null or p_revision is null or p_supplier_id is null then
    return null;
  end if;

  h := md5(
    'shugyla.procurement.legacy.attempt_v1|'
    || p_snapshot_id::text || '|'
    || p_revision::text || '|'
    || p_supplier_id::text
  );

  return (
    substr(h, 1, 8) || '-' ||
    substr(h, 9, 4) || '-' ||
    '5' || substr(h, 14, 3) || '-' ||
    '8' || substr(h, 18, 3) || '-' ||
    substr(h, 21, 12)
  )::uuid;
end;
$$;

alter function auth_private.procurement_legacy_attempt_key(uuid, integer, uuid) owner to postgres;

comment on function auth_private.procurement_legacy_attempt_key(uuid, integer, uuid) is
  'Stable UUID for pre-attempt_key clients: one analytics order per snapshot revision + supplier.';

revoke all on function auth_private.procurement_legacy_attempt_key(uuid, integer, uuid) from public;
revoke all on function auth_private.procurement_legacy_attempt_key(uuid, integer, uuid) from anon;
revoke all on function auth_private.procurement_legacy_attempt_key(uuid, integer, uuid) from authenticated;
grant execute on function auth_private.procurement_legacy_attempt_key(uuid, integer, uuid) to service_role;

-- Backfill historical analytics orders so a legacy retry still collides on the
-- same key instead of inserting a duplicate.
-- Invariant: at most one non-cancelled analytics order per legacy key.
-- Partition by (snapshot, revision, supplier); prefer a live row, then the
-- earliest id. Cancelled rows may share a key because the unique index
-- excludes status = 'cancelled'.
update public.purchase_orders as po
set attempt_key = ranked.legacy_key
from (
  select
    src.id,
    auth_private.procurement_legacy_attempt_key(
      src.source_snapshot_id,
      src.source_snapshot_revision,
      src.supplier_id
    ) as legacy_key
  from (
    select
      inner_po.id,
      inner_po.source_snapshot_id,
      inner_po.source_snapshot_revision,
      inner_po.supplier_id,
      row_number() over (
        partition by
          inner_po.source_snapshot_id,
          inner_po.source_snapshot_revision,
          inner_po.supplier_id
        order by
          (inner_po.status = 'cancelled') asc,
          inner_po.created_at asc,
          inner_po.id asc
      ) as rn
    from public.purchase_orders as inner_po
    where inner_po.workflow_mode = 'analytics'
      and inner_po.attempt_key is null
      and inner_po.source_snapshot_id is not null
      and inner_po.source_snapshot_revision is not null
      and inner_po.supplier_id is not null
  ) as src
  where src.rn = 1
) as ranked
where po.id = ranked.id
  and ranked.legacy_key is not null
  and not exists (
    select 1
    from public.purchase_orders as other
    where other.workflow_mode = 'analytics'
      and other.status <> 'cancelled'
      and other.attempt_key = ranked.legacy_key
  );

create or replace function auth_private.procurement_canonical_qty(p_qty numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_qty, 0) <= 0 then '0'
    else trim(trailing '.' from trim(trailing '0' from round(p_qty, 3)::text))
  end;
$$;

alter function auth_private.procurement_canonical_qty(numeric) owner to postgres;
revoke all on function auth_private.procurement_canonical_qty(numeric) from public;
revoke all on function auth_private.procurement_canonical_qty(numeric) from anon;
revoke all on function auth_private.procurement_canonical_qty(numeric) from authenticated;
grant execute on function auth_private.procurement_canonical_qty(numeric) to service_role;

create or replace function auth_private.procurement_attempt_fingerprint(
  p_snapshot_id uuid,
  p_supplier_id uuid,
  p_expected_delivery_date date,
  p_items jsonb
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_lines text := '';
begin
  if p_snapshot_id is null or p_supplier_id is null or p_expected_delivery_date is null then
    return '';
  end if;

  select coalesce(
    string_agg(
      item.barcode || '=' || auth_private.procurement_canonical_qty(item.qty),
      chr(10)
      order by item.barcode
    ),
    ''
  )
  into v_lines
  from (
    select
      btrim(coalesce(elem ->> 'barcode', '')) as barcode,
      coalesce((elem ->> 'qty')::numeric, 0) as qty
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as elem
  ) as item
  where item.barcode <> ''
    and item.qty > 0;

  return concat_ws(
    chr(10),
    'shugyla.procurement.attempt.fp.v1',
    'snapshot=' || p_snapshot_id::text,
    'supplier=' || p_supplier_id::text,
    'date=' || to_char(p_expected_delivery_date, 'YYYY-MM-DD'),
    nullif(v_lines, '')
  );
end;
$$;

alter function auth_private.procurement_attempt_fingerprint(uuid, uuid, date, jsonb) owner to postgres;

revoke all on function auth_private.procurement_attempt_fingerprint(uuid, uuid, date, jsonb) from public;
revoke all on function auth_private.procurement_attempt_fingerprint(uuid, uuid, date, jsonb) from anon;
revoke all on function auth_private.procurement_attempt_fingerprint(uuid, uuid, date, jsonb) from authenticated;
grant execute on function auth_private.procurement_attempt_fingerprint(uuid, uuid, date, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Planning guard: generated_purchase_order_id is no longer a write lock.
-- Qty remains editable on ready / partially_generated / generated snapshots
-- so a buyer can enter the next quantity after a successful order (reset to 0).
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
  'BEFORE UPDATE guard on procurement_snapshot_items. Fact columns stay immutable. Planning qty is editable on a working snapshot even after previous orders. Reads snapshot status without locking: generate already locks snapshot then items, so FOR SHARE here inverted the lock order and deadlocked. RLS USING/WITH CHECK still require a working snapshot. security definer: the function historically selected FOR SHARE, which needs UPDATE on procurement_snapshots — authenticated must not have that privilege.';

revoke all on function public.procurement_snapshot_items_guard_update() from public;
revoke all on function public.procurement_snapshot_items_guard_update() from anon;
revoke all on function public.procurement_snapshot_items_guard_update() from authenticated;
revoke all on function public.procurement_snapshot_items_guard_update() from service_role;

drop policy if exists procurement_snapshot_items_update_edit
  on public.procurement_snapshot_items;

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
        and s.status in ('ready', 'partially_generated', 'generated')
    )
  )
  with check (
    auth_private.current_user_has_permission('procurement.edit')
    and exists (
      select 1
      from public.procurement_snapshots as s
      where s.id = procurement_snapshot_items.snapshot_id
        and s.status in ('ready', 'partially_generated', 'generated')
    )
  );

-- ---------------------------------------------------------------------------
-- Analytics identity: direct writes must not forge attempt_key / lineage.
-- Invoker trigger: it only inspects NEW/OLD on the same row.
-- ---------------------------------------------------------------------------

create or replace function public.purchase_orders_guard_analytics_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.workflow_mode = 'simple'
       and (
         new.attempt_key is not null
         or new.source_snapshot_id is not null
         or new.generation_payload_fingerprint is not null
       )
    then
      raise exception 'purchase_orders: simple orders cannot carry analytics lineage'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.workflow_mode is distinct from new.workflow_mode then
    raise exception 'purchase_orders: workflow_mode is immutable'
      using errcode = '42501';
  end if;

  if old.workflow_mode = 'analytics' then
    if old.attempt_key is distinct from new.attempt_key
       or old.source_snapshot_id is distinct from new.source_snapshot_id
       or old.source_snapshot_revision is distinct from new.source_snapshot_revision
       or old.generation_payload_fingerprint is distinct from new.generation_payload_fingerprint
    then
      raise exception 'purchase_orders: analytics identity columns are immutable'
        using errcode = '42501';
    end if;
  end if;

  if old.workflow_mode = 'simple'
     and (
       new.attempt_key is not null
       or new.source_snapshot_id is not null
       or new.generation_payload_fingerprint is not null
     )
  then
    raise exception 'purchase_orders: simple orders cannot carry analytics lineage'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

alter function public.purchase_orders_guard_analytics_identity() owner to postgres;

drop trigger if exists trg_purchase_orders_guard_analytics_identity on public.purchase_orders;
create trigger trg_purchase_orders_guard_analytics_identity
  before insert or update on public.purchase_orders
  for each row
  execute function public.purchase_orders_guard_analytics_identity();

revoke all on function public.purchase_orders_guard_analytics_identity() from public;
revoke all on function public.purchase_orders_guard_analytics_identity() from anon;
revoke all on function public.purchase_orders_guard_analytics_identity() from authenticated;
revoke all on function public.purchase_orders_guard_analytics_identity() from service_role;

-- ---------------------------------------------------------------------------
-- RLS: analytics documents are created by the service_role generate RPC.
-- Analytics status transitions go through SECURITY DEFINER
-- procurement_return_order_to_draft / procurement_cancel_order.
-- Warehouse receiving for analytics goes through receiving_*_v1 RPCs.
-- Direct client INSERT/UPDATE/DELETE stays simple/manual only.
-- ---------------------------------------------------------------------------

drop policy if exists purchase_orders_insert_active_employee on public.purchase_orders;
drop policy if exists purchase_orders_insert_simple on public.purchase_orders;
create policy purchase_orders_insert_simple
  on public.purchase_orders
  for insert
  to authenticated
  with check (
    auth_private.current_employee_is_active()
    and workflow_mode = 'simple'
    and attempt_key is null
    and source_snapshot_id is null
    and generation_payload_fingerprint is null
  );

drop policy if exists purchase_orders_update_active_employee on public.purchase_orders;
drop policy if exists purchase_orders_update_simple on public.purchase_orders;
create policy purchase_orders_update_simple
  on public.purchase_orders
  for update
  to authenticated
  using (
    auth_private.current_employee_is_active()
    and workflow_mode = 'simple'
  )
  with check (
    auth_private.current_employee_is_active()
    and workflow_mode = 'simple'
    and attempt_key is null
    and source_snapshot_id is null
    and generation_payload_fingerprint is null
  );

drop policy if exists purchase_orders_delete_active_employee on public.purchase_orders;
drop policy if exists purchase_orders_delete_simple on public.purchase_orders;
create policy purchase_orders_delete_simple
  on public.purchase_orders
  for delete
  to authenticated
  using (
    auth_private.current_employee_is_active()
    and workflow_mode = 'simple'
  );

create or replace function auth_private.purchase_order_is_simple(p_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.purchase_orders as o
    where o.id = p_id
      and o.workflow_mode = 'simple'
  );
$$;

alter function auth_private.purchase_order_is_simple(uuid) owner to postgres;

revoke all on function auth_private.purchase_order_is_simple(uuid) from public;
revoke all on function auth_private.purchase_order_is_simple(uuid) from anon;
grant execute on function auth_private.purchase_order_is_simple(uuid) to authenticated;
grant execute on function auth_private.purchase_order_is_simple(uuid) to service_role;

drop function if exists auth_private.purchase_order_analytics_draft(uuid);

drop policy if exists purchase_order_items_insert_active_employee on public.purchase_order_items;
drop policy if exists purchase_order_items_insert_simple_or_analytics_draft on public.purchase_order_items;
drop policy if exists purchase_order_items_insert_simple on public.purchase_order_items;
create policy purchase_order_items_insert_simple
  on public.purchase_order_items
  for insert
  to authenticated
  with check (
    auth_private.current_employee_is_active()
    and auth_private.purchase_order_is_simple(purchase_order_id)
  );

drop policy if exists purchase_order_items_update_active_employee on public.purchase_order_items;
drop policy if exists purchase_order_items_update_simple on public.purchase_order_items;
create policy purchase_order_items_update_simple
  on public.purchase_order_items
  for update
  to authenticated
  using (
    auth_private.current_employee_is_active()
    and auth_private.purchase_order_is_simple(purchase_order_id)
  )
  with check (
    auth_private.current_employee_is_active()
    and auth_private.purchase_order_is_simple(purchase_order_id)
  );

drop policy if exists purchase_order_items_delete_active_employee on public.purchase_order_items;
drop policy if exists purchase_order_items_delete_simple_or_analytics_draft on public.purchase_order_items;
drop policy if exists purchase_order_items_delete_simple on public.purchase_order_items;
create policy purchase_order_items_delete_simple
  on public.purchase_order_items
  for delete
  to authenticated
  using (
    auth_private.current_employee_is_active()
    and auth_private.purchase_order_is_simple(purchase_order_id)
  );

drop policy if exists receiving_documents_insert_active_employee on public.receiving_documents;
drop policy if exists receiving_documents_insert_simple on public.receiving_documents;
create policy receiving_documents_insert_simple
  on public.receiving_documents
  for insert
  to authenticated
  with check (
    auth_private.current_employee_is_active()
    and workflow_mode = 'simple'
  );

drop policy if exists receiving_documents_update_active_employee on public.receiving_documents;
drop policy if exists receiving_documents_update_simple on public.receiving_documents;
create policy receiving_documents_update_simple
  on public.receiving_documents
  for update
  to authenticated
  using (
    auth_private.current_employee_is_active()
    and workflow_mode = 'simple'
  )
  with check (
    auth_private.current_employee_is_active()
    and workflow_mode = 'simple'
  );

drop policy if exists receiving_documents_delete_active_employee on public.receiving_documents;
drop policy if exists receiving_documents_delete_simple on public.receiving_documents;
create policy receiving_documents_delete_simple
  on public.receiving_documents
  for delete
  to authenticated
  using (
    auth_private.current_employee_is_active()
    and workflow_mode = 'simple'
  );

create or replace function auth_private.receiving_document_is_simple(p_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.receiving_documents as d
    where d.id = p_id
      and d.workflow_mode = 'simple'
  );
$$;

alter function auth_private.receiving_document_is_simple(uuid) owner to postgres;

revoke all on function auth_private.receiving_document_is_simple(uuid) from public;
revoke all on function auth_private.receiving_document_is_simple(uuid) from anon;
grant execute on function auth_private.receiving_document_is_simple(uuid) to authenticated;
grant execute on function auth_private.receiving_document_is_simple(uuid) to service_role;

drop policy if exists receiving_items_insert_active_employee on public.receiving_items;
drop policy if exists receiving_items_insert_simple on public.receiving_items;
create policy receiving_items_insert_simple
  on public.receiving_items
  for insert
  to authenticated
  with check (
    auth_private.current_employee_is_active()
    and auth_private.receiving_document_is_simple(receiving_document_id)
  );

drop policy if exists receiving_items_update_active_employee on public.receiving_items;
drop policy if exists receiving_items_update_simple on public.receiving_items;
create policy receiving_items_update_simple
  on public.receiving_items
  for update
  to authenticated
  using (
    auth_private.current_employee_is_active()
    and auth_private.receiving_document_is_simple(receiving_document_id)
  )
  with check (
    auth_private.current_employee_is_active()
    and auth_private.receiving_document_is_simple(receiving_document_id)
  );

drop policy if exists receiving_items_delete_active_employee on public.receiving_items;
drop policy if exists receiving_items_delete_simple on public.receiving_items;
create policy receiving_items_delete_simple
  on public.receiving_items
  for delete
  to authenticated
  using (
    auth_private.current_employee_is_active()
    and auth_private.receiving_document_is_simple(receiving_document_id)
  );

-- ---------------------------------------------------------------------------
-- Generate RPC: attempt_key idempotency, qty reset, no empty orders
-- ---------------------------------------------------------------------------

drop function if exists public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text);
drop function if exists public.generate_procurement_orders_from_snapshot_selected_unsafe(uuid, date, uuid[], text, text);

create function public.generate_procurement_orders_from_snapshot(
  p_snapshot_id uuid,
  p_expected_delivery_date date,
  p_supplier_ids uuid[],
  p_created_by text default null,
  p_created_by_name text default null,
  p_attempt_key uuid default null,
  p_payload_fingerprint text default null
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
  v_existing public.purchase_orders%rowtype;
  v_order_id uuid;
  v_receiving_id uuid;
  v_po_item_id uuid;
  v_attempt_key uuid;
  v_client_fp text;
  v_server_fp text;
  v_items_payload jsonb;
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
      if v_existing.receiving_document_id is not null then
        v_receiving_ids := array_append(v_receiving_ids, v_existing.receiving_document_id);
      end if;
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
      coalesce(sum(i.final_order_qty), 0)::numeric(14, 3),
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
    into v_total_amount, v_items_count, v_total_ordered_qty, v_items_payload
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
    v_receiving_id := gen_random_uuid();

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
        if v_existing.receiving_document_id is not null then
          v_receiving_ids := array_append(v_receiving_ids, v_existing.receiving_document_id);
        end if;
        continue;
    end;

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
        final_order_qty = 0,
        -- Keep override=true: applyNormDaysChange / set_procurement_norm_rule
        -- refill final_order_qty from recommended when override is false.
        -- Consumed 0 is not "following the recommendation".
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
    v_receiving_ids := array_append(v_receiving_ids, v_receiving_id);
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
    'receiving_document_ids', to_jsonb(v_receiving_ids),
    'orders_created', v_orders_created,
    'orders_existing', v_orders_existing,
    'skipped_no_supplier', v_skipped_no_supplier,
    'items_ordered', v_items_ordered,
    'remaining_suppliers', v_remaining_suppliers,
    'nothing_to_order', v_orders_created = 0 and v_items_ordered = 0 and v_orders_existing = 0
  );
end;
$$;

alter function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text, uuid, text) owner to postgres;

comment on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text, uuid, text) is
  'Create analytics purchase/receiving documents from current snapshot qty. Same attempt_key is idempotent; a new key creates another order. Omitting attempt_key uses a stable per-supplier legacy key so old clients cannot spawn duplicates. service_role only.';

revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text, uuid, text) from public;
revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text, uuid, text) from anon;
revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text, uuid, text) from authenticated;
grant execute on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text, uuid, text) to service_role;

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
begin
  raise exception 'supplier selection is required' using errcode = '22023';
end;
$$;

alter function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) owner to postgres;

comment on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) is
  'Deprecated compatibility RPC. Refuses generation without an explicit supplier.';

revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) from public;
revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) from anon;
revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) from authenticated;
grant execute on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Cancel restores consumed planning qty so the buyer can reorder.
-- Analytics status stays RPC-only; this function is already SECURITY DEFINER.
-- ---------------------------------------------------------------------------

create or replace function public.procurement_cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.purchase_orders;
  v_receiving_started boolean;
  v_cancelled_documents integer := 0;
begin
  if p_order_id is null then
    raise exception 'Заказ не найден' using errcode = '22004';
  end if;

  perform auth_private.require_procurement_edit();

  select * into v_order
  from public.purchase_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Заказ не найден' using errcode = '22004';
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object(
      'order_id', v_order.id,
      'status', v_order.status,
      'cancelled_receiving_documents', 0,
      'changed', false
    );
  end if;

  if v_order.status = 'received' then
    raise exception 'Принятый заказ отменить нельзя'
      using errcode = '55000';
  end if;

  perform 1
  from public.receiving_documents as d
  where d.purchase_order_id = p_order_id
    and d.status <> 'cancelled'
  for update;

  select count(*) > 0
    into v_receiving_started
  from public.receiving_documents as d
  where d.purchase_order_id = p_order_id
    and d.status <> 'cancelled'
    and (
      d.status <> 'awaiting_receiving'
      or coalesce(d.total_received_qty, 0) > 0
    );

  if v_receiving_started then
    raise exception 'Склад начал приёмку — заказ изменить нельзя'
      using errcode = '55000';
  end if;

  update public.receiving_documents
     set status = 'cancelled',
         updated_at = now()
   where purchase_order_id = p_order_id
     and status <> 'cancelled';

  get diagnostics v_cancelled_documents = row_count;

  update public.purchase_orders
     set status = 'cancelled',
         updated_at = now()
   where id = p_order_id;

  if v_order.workflow_mode = 'analytics' and v_order.source_snapshot_id is not null then
    -- Restore consumed zeros that still point at this order. Leave a newer
    -- typed qty alone. Then drop the cancelled pointer everywhere it remains.
    update public.procurement_snapshot_items as i
    set
      final_order_qty = poi.ordered_qty,
      manual_override = true,
      generated_purchase_order_id = null,
      updated_at = now()
    from public.purchase_order_items as poi
    where poi.purchase_order_id = p_order_id
      and i.snapshot_id = v_order.source_snapshot_id
      and i.barcode = poi.barcode
      and i.generated_purchase_order_id = p_order_id
      and i.final_order_qty = 0;

    update public.procurement_snapshot_items
    set
      generated_purchase_order_id = null,
      updated_at = now()
    where generated_purchase_order_id = p_order_id;
  end if;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'cancelled',
    'cancelled_receiving_documents', v_cancelled_documents,
    'changed', true
  );
end;
$$;

alter function public.procurement_cancel_order(uuid) owner to postgres;

comment on function public.procurement_cancel_order(uuid) is
  'Cancels a purchase order and its receiving documents. For analytics, restores consumed planning qty when the row is still zero and still points at this order, then clears the cancelled pointer. Requires procurement.edit. Refuses once receiving has started.';

-- ---------------------------------------------------------------------------
-- Norms follow the live planning row, not the last-order pointer
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

  if v_snapshot.status not in ('ready', 'partially_generated', 'generated') then
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

alter function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) owner to postgres;

comment on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) is
  'Upsert a norm rule and update planning rows in a working snapshot, including rows that already have order history. service_role only.';

revoke all on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) from public;
revoke all on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) from anon;
revoke all on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) from authenticated;
grant execute on function public.set_procurement_norm_rule_for_snapshot(uuid, text, text, integer, text, text) to service_role;

notify pgrst, 'reload schema';
