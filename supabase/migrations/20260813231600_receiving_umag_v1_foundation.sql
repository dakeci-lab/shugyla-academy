-- Receiving / UMAG export v1 foundation.
--
-- Additive only. This migration deliberately does not delete or merge legacy
-- receiving documents. Production currently has a cancelled + active pair for
-- one order, therefore the one-live-document rule is enforced with a partial
-- unique index instead of a blanket UNIQUE constraint.

select pg_advisory_xact_lock(202608132316);

create schema if not exists auth_private;

-- ---------------------------------------------------------------------------
-- Additive document and line fields
-- ---------------------------------------------------------------------------

alter table public.purchase_order_items
  add column if not exists unit text not null default '';

comment on column public.purchase_order_items.unit is
  'UMAG measure/unit snapshot copied from the procurement snapshot.';

alter table public.receiving_documents
  add column if not exists supplier_invoice_numbers text[] not null default '{}',
  add column if not exists version bigint not null default 1,
  add column if not exists started_at timestamptz null,
  add column if not exists completed_at timestamptz null,
  add column if not exists total_received_amount numeric(20, 4) not null default 0,
  add column if not exists export_version bigint not null default 0,
  add column if not exists last_exported_at timestamptz null,
  add column if not exists last_exported_by uuid null references auth.users(id) on delete set null,
  add column if not exists last_export_filename text null;

alter table public.receiving_documents
  drop constraint if exists receiving_documents_version_positive,
  add constraint receiving_documents_version_positive check (version > 0),
  drop constraint if exists receiving_documents_export_version_nonnegative,
  add constraint receiving_documents_export_version_nonnegative check (export_version >= 0),
  drop constraint if exists receiving_documents_received_amount_nonnegative,
  add constraint receiving_documents_received_amount_nonnegative check (total_received_amount >= 0);

alter table public.receiving_items
  add column if not exists unit text not null default '',
  add column if not exists actual_purchase_price numeric(20, 4) not null default 0,
  add column if not exists is_outside_order boolean not null default false,
  add column if not exists discrepancy_reason text null,
  add column if not exists discrepancy_reason_code text null,
  add column if not exists photo_urls text[] not null default '{}',
  add column if not exists photo_metadata jsonb not null default '[]'::jsonb,
  add column if not exists sort_order integer not null default 0;

-- Existing purchase_price is the immutable ordered-price snapshot. Populate the
-- new actual price once; no source values are overwritten.
update public.receiving_items
set actual_purchase_price = purchase_price
where actual_purchase_price = 0
  and purchase_price <> 0;

alter table public.receiving_items
  drop constraint if exists receiving_items_quantities_nonnegative,
  add constraint receiving_items_quantities_nonnegative
    check (ordered_qty >= 0 and received_qty >= 0),
  drop constraint if exists receiving_items_prices_nonnegative,
  add constraint receiving_items_prices_nonnegative
    check (purchase_price >= 0 and actual_purchase_price >= 0),
  drop constraint if exists receiving_items_outside_order_shape,
  add constraint receiving_items_outside_order_shape
    check (
      not is_outside_order
      or (purchase_order_item_id is null and ordered_qty = 0)
    ),
  drop constraint if exists receiving_items_photo_metadata_array,
  add constraint receiving_items_photo_metadata_array
    check (jsonb_typeof(photo_metadata) = 'array'),
  drop constraint if exists receiving_items_discrepancy_reason_check,
  add constraint receiving_items_discrepancy_reason_check
    check (
      discrepancy_reason_code is null
      or discrepancy_reason_code in (
        'damaged', 'not_delivered', 'quantity_mismatch', 'price_changed', 'other',
        'Недопоставка', 'Не привезли', 'Повреждение', 'Излишек',
        'Ошибка в заказе', 'Другое', 'Вне заказа'
      )
    );

comment on column public.receiving_items.photo_urls is
  'Private Storage object paths in the receiving-discrepancy-photos bucket. Signed URLs are ephemeral and must never be persisted.';
comment on column public.receiving_items.photo_metadata is
  'Optional metadata for persisted discrepancy photos. Must be a JSON array.';
comment on column public.receiving_items.sort_order is
  'Stable display order of a line inside a receiving document.';

-- ---------------------------------------------------------------------------
-- Private discrepancy photo storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'receiving-discrepancy-photos',
  'receiving-discrepancy-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object path: documents/{receiving_document_id}/{receiving_item_id}/{uuid.ext}
-- The item row can be new (outside-order), so INSERT validates the existing
-- document plus a UUID-shaped item folder rather than requiring the item row.
drop policy if exists receiving_discrepancy_photos_select on storage.objects;
create policy receiving_discrepancy_photos_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'receiving-discrepancy-photos'
    and (storage.foldername(name))[1] = 'documents'
    and array_length(storage.foldername(name), 1) = 3
    and exists (
      select 1
      from public.receiving_documents as document
      where document.id::text = (storage.foldername(name))[2]
    )
    and (
      (select auth_private.current_user_has_permission('receiving.view'))
      or (select auth_private.current_user_has_permission('receiving.manage'))
    )
  );

drop policy if exists receiving_discrepancy_photos_insert on storage.objects;
create policy receiving_discrepancy_photos_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'receiving-discrepancy-photos'
    and (storage.foldername(name))[1] = 'documents'
    and array_length(storage.foldername(name), 1) = 3
    and (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'heic')
    and exists (
      select 1
      from public.receiving_documents as document
      where document.id::text = (storage.foldername(name))[2]
    )
    and (select auth_private.current_user_has_permission('receiving.manage'))
  );

drop policy if exists receiving_discrepancy_photos_delete on storage.objects;
create policy receiving_discrepancy_photos_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'receiving-discrepancy-photos'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = 'documents'
    and exists (
      select 1
      from public.receiving_documents as document
      where document.id::text = (storage.foldername(name))[2]
    )
    and (select auth_private.current_user_has_permission('receiving.manage'))
  );

-- Exactly one non-cancelled receiving document may exist for an order. Cancelled
-- history remains intact, including the known production duplicate.
create unique index if not exists idx_receiving_documents_one_live_per_order
  on public.receiving_documents (purchase_order_id)
  where purchase_order_id is not null and status <> 'cancelled';

create index if not exists idx_receiving_documents_calendar
  on public.receiving_documents (expected_delivery_date, status);

create index if not exists idx_receiving_items_barcode
  on public.receiving_items (barcode);

-- ---------------------------------------------------------------------------
-- Preserve UMAG unit in existing and future generation paths
-- ---------------------------------------------------------------------------

create or replace function public.purchase_order_items_fill_unit_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(coalesce(new.unit, '')), '') is null
     and nullif(btrim(coalesce(new.barcode, '')), '') is not null then
    select coalesce(i.measure, '')
      into new.unit
    from public.purchase_orders as o
    join public.procurement_snapshot_items as i
      on i.snapshot_id = o.source_snapshot_id
     and i.barcode = new.barcode
    where o.id = new.purchase_order_id
    order by i.created_at desc
    limit 1;
  end if;
  new.unit := coalesce(new.unit, '');
  return new;
end;
$$;

alter function public.purchase_order_items_fill_unit_v1() owner to postgres;
revoke all on function public.purchase_order_items_fill_unit_v1() from public;
revoke all on function public.purchase_order_items_fill_unit_v1() from anon;
revoke all on function public.purchase_order_items_fill_unit_v1() from authenticated;

drop trigger if exists purchase_order_items_fill_unit_v1 on public.purchase_order_items;
create trigger purchase_order_items_fill_unit_v1
  before insert or update of barcode, purchase_order_id, unit
  on public.purchase_order_items
  for each row execute function public.purchase_order_items_fill_unit_v1();

create or replace function public.receiving_items_fill_unit_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(coalesce(new.unit, '')), '') is null
     and new.purchase_order_item_id is not null then
    select coalesce(i.unit, '')
      into new.unit
    from public.purchase_order_items as i
    where i.id = new.purchase_order_item_id;
  end if;
  new.unit := coalesce(new.unit, '');
  return new;
end;
$$;

alter function public.receiving_items_fill_unit_v1() owner to postgres;
revoke all on function public.receiving_items_fill_unit_v1() from public;
revoke all on function public.receiving_items_fill_unit_v1() from anon;
revoke all on function public.receiving_items_fill_unit_v1() from authenticated;

drop trigger if exists receiving_items_fill_unit_v1 on public.receiving_items;
create trigger receiving_items_fill_unit_v1
  before insert or update of purchase_order_item_id, unit
  on public.receiving_items
  for each row execute function public.receiving_items_fill_unit_v1();

-- Safe enrichment for existing rows. Blank remains blank when the source
-- snapshot had no unit; export validation will surface that instead of guessing.
update public.purchase_order_items as poi
set unit = psi.measure
from public.purchase_orders as po,
     public.procurement_snapshot_items as psi
where poi.purchase_order_id = po.id
  and psi.snapshot_id = po.source_snapshot_id
  and psi.barcode = poi.barcode
  and nullif(btrim(coalesce(poi.unit, '')), '') is null
  and nullif(btrim(coalesce(psi.measure, '')), '') is not null;

update public.receiving_items as ri
set unit = poi.unit
from public.purchase_order_items as poi
where ri.purchase_order_item_id = poi.id
  and nullif(btrim(coalesce(ri.unit, '')), '') is null
  and nullif(btrim(coalesce(poi.unit, '')), '') is not null;

-- ---------------------------------------------------------------------------
-- Immutable completion snapshots and UMAG export history
-- ---------------------------------------------------------------------------

create table if not exists public.receiving_document_versions (
  id uuid primary key default gen_random_uuid(),
  receiving_document_id uuid not null
    references public.receiving_documents(id) on delete cascade,
  document_version bigint not null,
  event_type text not null default 'completed'
    check (event_type in ('completed', 'completed_edit')),
  snapshot jsonb not null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint receiving_document_versions_document_version_unique
    unique (receiving_document_id, document_version),
  constraint receiving_document_versions_snapshot_object
    check (jsonb_typeof(snapshot) = 'object')
);

create index if not exists idx_receiving_document_versions_document
  on public.receiving_document_versions (receiving_document_id, document_version desc);

create table if not exists public.receiving_umag_exports (
  id uuid primary key default gen_random_uuid(),
  receiving_document_id uuid not null
    references public.receiving_documents(id) on delete cascade,
  document_version bigint not null,
  export_version bigint not null,
  file_name text not null,
  row_count integer not null default 0,
  total_quantity numeric(20, 4) not null default 0,
  total_amount numeric(20, 4) not null default 0,
  umag_comment text not null default '',
  generated_by uuid null references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  constraint receiving_umag_exports_version_unique
    unique (receiving_document_id, export_version),
  constraint receiving_umag_exports_counts_nonnegative
    check (export_version > 0 and row_count >= 0 and total_quantity >= 0 and total_amount >= 0),
  constraint receiving_umag_exports_filename_not_empty
    check (char_length(btrim(file_name)) > 0)
);

create index if not exists idx_receiving_umag_exports_document
  on public.receiving_umag_exports (receiving_document_id, export_version desc);

alter table public.receiving_document_versions enable row level security;
alter table public.receiving_umag_exports enable row level security;

revoke all on table public.receiving_document_versions from public, anon, authenticated;
revoke all on table public.receiving_umag_exports from public, anon, authenticated;
grant select on table public.receiving_document_versions to authenticated;
grant select on table public.receiving_umag_exports to authenticated;
grant all on table public.receiving_document_versions to service_role;
grant all on table public.receiving_umag_exports to service_role;

drop policy if exists receiving_document_versions_select on public.receiving_document_versions;
create policy receiving_document_versions_select
  on public.receiving_document_versions
  for select to authenticated
  using (
    (select auth_private.current_user_has_permission('receiving.view'))
    or (select auth_private.current_user_has_permission('receiving.manage'))
  );

drop policy if exists receiving_umag_exports_select on public.receiving_umag_exports;
create policy receiving_umag_exports_select
  on public.receiving_umag_exports
  for select to authenticated
  using (
    (select auth_private.current_user_has_permission('receiving.view'))
    or (select auth_private.current_user_has_permission('receiving.manage'))
  );

-- ---------------------------------------------------------------------------
-- Atomic write contract for receiving v1
-- ---------------------------------------------------------------------------

create or replace function auth_private.require_receiving_manage_v1()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Требуется вход в систему' using errcode = '42501';
  end if;
  if not auth_private.current_user_has_permission('receiving.manage') then
    raise exception 'Недостаточно прав для управления приёмкой' using errcode = '42501';
  end if;
end;
$$;

alter function auth_private.require_receiving_manage_v1() owner to postgres;
revoke all on function auth_private.require_receiving_manage_v1() from public, anon;
grant execute on function auth_private.require_receiving_manage_v1() to authenticated;

create or replace function public.receiving_start_v1(
  p_document_id uuid,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.receiving_documents%rowtype;
  v_now timestamptz := now();
begin
  perform auth_private.require_receiving_manage_v1();

  select * into v_doc
  from public.receiving_documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Документ приёмки не найден' using errcode = 'P0002';
  end if;
  if v_doc.status = 'cancelled' then
    raise exception 'Отменённую приёмку начать нельзя' using errcode = '55000';
  end if;
  if p_expected_version is not null and v_doc.version <> p_expected_version then
    raise exception 'Приёмка была изменена другим сотрудником. Обновите страницу.' using errcode = '40001';
  end if;

  if v_doc.status = 'awaiting_receiving' then
    update public.receiving_items
       set received_qty = ordered_qty,
           difference_qty = 0,
           actual_purchase_price = purchase_price,
           status = 'received',
           updated_at = v_now
     where receiving_document_id = p_document_id;

    update public.receiving_documents
       set status = 'in_progress',
           started_at = coalesce(started_at, v_now),
           total_received_qty = total_ordered_qty,
           total_difference_qty = 0,
           total_received_amount = coalesce((
             select sum(i.received_qty * i.actual_purchase_price)
             from public.receiving_items as i
             where i.receiving_document_id = p_document_id
           ), 0),
           version = version + 1,
           updated_at = v_now
     where id = p_document_id
     returning * into v_doc;
  end if;

  return jsonb_build_object('document_id', v_doc.id, 'version', v_doc.version, 'status', v_doc.status);
end;
$$;

alter function public.receiving_start_v1(uuid, bigint) owner to postgres;
revoke all on function public.receiving_start_v1(uuid, bigint) from public, anon;
grant execute on function public.receiving_start_v1(uuid, bigint) to authenticated;

create or replace function auth_private.receiving_apply_v1(
  p_document_id uuid,
  p_expected_version bigint,
  p_invoice_numbers text[],
  p_items jsonb,
  p_complete boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.receiving_documents%rowtype;
  v_line jsonb;
  v_existing public.receiving_items%rowtype;
  v_item_id uuid;
  v_purchase_item_id uuid;
  v_received numeric(20, 4);
  v_actual_price numeric(20, 4);
  v_barcode text;
  v_name text;
  v_unit text;
  v_photo_paths jsonb;
  v_now timestamptz := now();
  v_new_version bigint;
  v_was_completed boolean;
begin
  perform auth_private.require_receiving_manage_v1();
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Список позиций имеет неверный формат' using errcode = '22023';
  end if;

  select * into v_doc
  from public.receiving_documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Документ приёмки не найден' using errcode = 'P0002';
  end if;
  if v_doc.status = 'cancelled' then
    raise exception 'Отменённую приёмку изменить нельзя' using errcode = '55000';
  end if;
  if p_expected_version is not null and v_doc.version <> p_expected_version then
    raise exception 'Приёмка была изменена другим сотрудником. Обновите страницу.' using errcode = '40001';
  end if;

  v_was_completed := v_doc.completed_at is not null;

  -- Only extra (outside-order) rows may disappear from a draft. Ordered rows are
  -- immutable snapshots and are updated in place.
  delete from public.receiving_items as existing
  where existing.receiving_document_id = p_document_id
    and existing.is_outside_order
    and not exists (
      select 1
      from jsonb_array_elements(p_items) as submitted(value)
      where nullif(submitted.value->>'id', '') is not null
        and (submitted.value->>'id')::uuid = existing.id
    );

  for v_line in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := case
      when nullif(v_line->>'id', '') is null then gen_random_uuid()
      else (v_line->>'id')::uuid
    end;
    v_received := coalesce(nullif(v_line->>'received_qty', '')::numeric,
                           nullif(v_line->>'receivedQty', '')::numeric, 0);
    v_actual_price := coalesce(nullif(v_line->>'actual_purchase_price', '')::numeric,
                               nullif(v_line->>'actualPurchasePrice', '')::numeric,
                               nullif(v_line->>'purchase_price', '')::numeric,
                               nullif(v_line->>'purchasePrice', '')::numeric, 0);
    v_photo_paths := coalesce(v_line->'photo_urls', v_line->'photoUrls', '[]'::jsonb);

    if v_received < 0 or v_actual_price < 0 then
      raise exception 'Количество и цена не могут быть отрицательными' using errcode = '22023';
    end if;
    if jsonb_typeof(v_photo_paths) <> 'array' then
      raise exception 'Список фотографий имеет неверный формат' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(v_photo_paths) as photo_path(value)
      where photo_path.value !~* '^documents/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|heic)$'
    ) then
      raise exception 'Можно сохранять только постоянные пути фотографий приёмки' using errcode = '22023';
    end if;

    select * into v_existing
    from public.receiving_items
    where id = v_item_id and receiving_document_id = p_document_id
    for update;

    if found then
      if lower(btrim(v_existing.unit)) in ('шт', 'шт.', 'pcs', 'piece')
         and v_received <> trunc(v_received) then
        raise exception 'Количество товара в штуках должно быть целым' using errcode = '22023';
      end if;

      update public.receiving_items
         set received_qty = v_received,
             difference_qty = v_received - ordered_qty,
             actual_purchase_price = v_actual_price,
             status = case
               when v_received = ordered_qty then 'received'
               when v_received > 0 then 'partial'
               else 'pending'
             end,
             discrepancy_reason_code = nullif(btrim(coalesce(
               v_line->>'discrepancy_reason_code', v_line->>'discrepancyReasonCode', ''
             )), ''),
             discrepancy_reason = nullif(btrim(coalesce(
               v_line->>'discrepancy_reason', v_line->>'discrepancyReason', ''
             )), ''),
             comment = coalesce(v_line->>'comment', ''),
             photo_urls = coalesce(
               array(select jsonb_array_elements_text(v_photo_paths)),
               '{}'
             ),
             photo_metadata = coalesce(v_line->'photo_metadata', v_line->'photoMetadata', '[]'::jsonb),
             sort_order = coalesce(
               nullif(v_line->>'sort_order', '')::integer,
               nullif(v_line->>'sortOrder', '')::integer,
               sort_order
             ),
             updated_at = v_now
       where id = v_item_id;
    else
      -- A new line is always outside the order. Resolve name and unit from the
      -- latest usable procurement snapshot by exact barcode; never trust a name
      -- supplied by the browser and never match by name.
      v_barcode := btrim(coalesce(v_line->>'barcode', ''));
      if v_barcode = '' then
        raise exception 'Для товара вне заказа требуется штрихкод' using errcode = '22023';
      end if;

      select i.product_name, i.measure
        into v_name, v_unit
      from public.procurement_snapshot_items as i
      join public.procurement_snapshots as s on s.id = i.snapshot_id
      where i.barcode = v_barcode
        and s.status in ('ready', 'partially_generated', 'generated')
        and nullif(btrim(i.product_name), '') is not null
        and nullif(btrim(i.measure), '') is not null
      order by coalesce(s.synced_at, s.created_at) desc, i.created_at desc
      limit 1;

      if not found then
        raise exception 'Товар вне заказа сначала нужно добавить в номенклатуру UMAG и синхронизировать закуп' using errcode = 'P0002';
      end if;
      if lower(btrim(v_unit)) in ('шт', 'шт.', 'pcs', 'piece')
         and v_received <> trunc(v_received) then
        raise exception 'Количество товара в штуках должно быть целым' using errcode = '22023';
      end if;

      v_purchase_item_id := null;
      insert into public.receiving_items (
        id, receiving_document_id, purchase_order_item_id, product_name, barcode,
        unit, ordered_qty, received_qty, difference_qty, purchase_price,
        actual_purchase_price, is_outside_order, status, discrepancy_reason, discrepancy_reason_code,
        comment, photo_urls, photo_metadata, sort_order, created_at, updated_at
      ) values (
        v_item_id, p_document_id, v_purchase_item_id, v_name, v_barcode,
        v_unit, 0, v_received, v_received, 0,
        v_actual_price, true,
        case when v_received > 0 then 'partial' else 'pending' end,
        nullif(btrim(coalesce(v_line->>'discrepancy_reason', v_line->>'discrepancyReason', '')), ''),
        nullif(btrim(coalesce(v_line->>'discrepancy_reason_code', v_line->>'discrepancyReasonCode', '')), ''),
        coalesce(v_line->>'comment', ''),
        coalesce(array(select jsonb_array_elements_text(v_photo_paths)), '{}'),
        coalesce(v_line->'photo_metadata', v_line->'photoMetadata', '[]'::jsonb),
        coalesce(nullif(v_line->>'sort_order', '')::integer, nullif(v_line->>'sortOrder', '')::integer, 0),
        v_now, v_now
      );
    end if;
  end loop;

  v_new_version := v_doc.version + 1;
  update public.receiving_documents
     set supplier_invoice_numbers = coalesce(
           (select array_agg(btrim(value))
           from unnest(coalesce(p_invoice_numbers, supplier_invoice_numbers, '{}'))
             as invoice_number(value)
            where btrim(value) <> ''),
           '{}'
         ),
         status = case when p_complete then 'received' else 'in_progress' end,
         started_at = coalesce(started_at, v_now),
         completed_at = case when p_complete then v_now else null end,
         total_ordered_qty = coalesce((
           select sum(i.ordered_qty) from public.receiving_items i
           where i.receiving_document_id = p_document_id
         ), 0),
         total_received_qty = coalesce((
           select sum(i.received_qty) from public.receiving_items i
           where i.receiving_document_id = p_document_id
         ), 0),
         total_difference_qty = coalesce((
           select sum(i.received_qty - i.ordered_qty) from public.receiving_items i
           where i.receiving_document_id = p_document_id
         ), 0),
         total_received_amount = coalesce((
           select sum(i.received_qty * i.actual_purchase_price) from public.receiving_items i
           where i.receiving_document_id = p_document_id
         ), 0),
         received_by = coalesce(
           (select au.login from public.academy_users au where au.auth_user_id = auth.uid()),
           received_by
         ),
         received_by_name = coalesce(
           (select nullif(au.full_name, '') from public.academy_users au where au.auth_user_id = auth.uid()),
           received_by_name
         ),
         version = v_new_version,
         updated_at = v_now
   where id = p_document_id;

  if v_doc.purchase_order_id is not null then
    update public.purchase_orders
       set status = case when p_complete then 'received' else 'awaiting_receiving' end,
           updated_at = v_now
     where id = v_doc.purchase_order_id;
  end if;

  if p_complete then
    insert into public.receiving_document_versions (
      receiving_document_id, document_version, event_type, snapshot, created_by
    ) values (
      p_document_id,
      v_new_version,
      case when v_was_completed then 'completed_edit' else 'completed' end,
      jsonb_build_object(
        'document', (select to_jsonb(d) from public.receiving_documents d where d.id = p_document_id),
        'items', coalesce((
          select jsonb_agg(to_jsonb(i) order by i.sort_order, i.created_at, i.id)
          from public.receiving_items i where i.receiving_document_id = p_document_id
        ), '[]'::jsonb)
      ),
      auth.uid()
    );
  end if;

  return jsonb_build_object(
    'document_id', p_document_id,
    'version', v_new_version,
    'status', case when p_complete then 'received' else 'in_progress' end
  );
end;
$$;

alter function auth_private.receiving_apply_v1(uuid, bigint, text[], jsonb, boolean) owner to postgres;
revoke all on function auth_private.receiving_apply_v1(uuid, bigint, text[], jsonb, boolean)
  from public, anon, authenticated;

create or replace function public.receiving_save_v1(
  p_document_id uuid,
  p_expected_version bigint,
  p_invoice_numbers text[],
  p_items jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select auth_private.receiving_apply_v1(
    p_document_id, p_expected_version, p_invoice_numbers, p_items, false
  );
$$;

create or replace function public.receiving_complete_v1(
  p_document_id uuid,
  p_expected_version bigint,
  p_invoice_numbers text[],
  p_items jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select auth_private.receiving_apply_v1(
    p_document_id, p_expected_version, p_invoice_numbers, p_items, true
  );
$$;

alter function public.receiving_save_v1(uuid, bigint, text[], jsonb) owner to postgres;
alter function public.receiving_complete_v1(uuid, bigint, text[], jsonb) owner to postgres;
revoke all on function public.receiving_save_v1(uuid, bigint, text[], jsonb) from public, anon;
revoke all on function public.receiving_complete_v1(uuid, bigint, text[], jsonb) from public, anon;
grant execute on function public.receiving_save_v1(uuid, bigint, text[], jsonb) to authenticated;
grant execute on function public.receiving_complete_v1(uuid, bigint, text[], jsonb) to authenticated;

create or replace function public.receiving_record_umag_export_v1(
  p_document_id uuid,
  p_expected_version bigint,
  p_expected_export_version bigint,
  p_file_name text,
  p_row_count integer,
  p_total_quantity numeric,
  p_total_amount numeric,
  p_umag_comment text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.receiving_documents%rowtype;
  v_export_version bigint;
  v_export_id uuid;
  v_now timestamptz := now();
begin
  perform auth_private.require_receiving_manage_v1();

  select * into v_doc
  from public.receiving_documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Документ приёмки не найден' using errcode = 'P0002';
  end if;
  if v_doc.status <> 'received' or v_doc.completed_at is null then
    raise exception 'Выгрузка доступна только для завершённой приёмки' using errcode = '55000';
  end if;
  if p_expected_version is not null and v_doc.version <> p_expected_version then
    raise exception 'Приёмка была изменена. Сформируйте файл заново.' using errcode = '40001';
  end if;
  if p_expected_export_version is not null
     and v_doc.export_version <> p_expected_export_version then
    raise exception 'История выгрузки была изменена. Сформируйте файл заново.' using errcode = '40001';
  end if;
  if nullif(btrim(coalesce(p_file_name, '')), '') is null then
    raise exception 'Не указано имя файла выгрузки' using errcode = '22023';
  end if;
  if coalesce(p_row_count, 0) <= 0 then
    raise exception 'В приёмке нет строк для выгрузки в UMAG' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.receiving_items i
    where i.receiving_document_id = p_document_id
      and i.received_qty > 0
      and (
        nullif(btrim(i.barcode), '') is null
        or nullif(btrim(i.product_name), '') is null
        or nullif(btrim(i.unit), '') is null
      )
  ) then
    raise exception 'У части принятых товаров не заполнены штрихкод, название или единица измерения' using errcode = '22023';
  end if;

  v_export_version := v_doc.export_version + 1;
  v_export_id := gen_random_uuid();

  insert into public.receiving_umag_exports (
    id, receiving_document_id, document_version, export_version, file_name,
    row_count, total_quantity, total_amount, umag_comment, generated_by, generated_at
  ) values (
    v_export_id, p_document_id, v_doc.version, v_export_version, btrim(p_file_name),
    p_row_count, coalesce(p_total_quantity, 0), coalesce(p_total_amount, 0),
    coalesce(p_umag_comment, ''), auth.uid(), v_now
  );

  update public.receiving_documents
     set export_version = v_export_version,
         last_exported_at = v_now,
         last_exported_by = auth.uid(),
         last_export_filename = btrim(p_file_name),
         updated_at = v_now
   where id = p_document_id;

  return jsonb_build_object(
    'export_id', v_export_id,
    'export_version', v_export_version,
    'document_version', v_doc.version,
    'generated_at', v_now
  );
end;
$$;

alter function public.receiving_record_umag_export_v1(
  uuid, bigint, bigint, text, integer, numeric, numeric, text
) owner to postgres;
revoke all on function public.receiving_record_umag_export_v1(
  uuid, bigint, bigint, text, integer, numeric, numeric, text
) from public, anon;
grant execute on function public.receiving_record_umag_export_v1(
  uuid, bigint, bigint, text, integer, numeric, numeric, text
) to authenticated;

notify pgrst, 'reload schema';
