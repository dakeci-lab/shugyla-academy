-- Procurement orders must always be generated for an explicit supplier set.
-- Keep the existing implementation behind a private function and expose guarded
-- wrappers under both previously published RPC signatures.

alter function public.generate_procurement_orders_from_snapshot(
  uuid,
  date,
  uuid[],
  text,
  text
) rename to generate_procurement_orders_from_snapshot_selected_unsafe;

revoke all on function public.generate_procurement_orders_from_snapshot_selected_unsafe(
  uuid,
  date,
  uuid[],
  text,
  text
) from public, anon, authenticated, service_role;

comment on function public.generate_procurement_orders_from_snapshot_selected_unsafe(
  uuid,
  date,
  uuid[],
  text,
  text
) is 'Private implementation. Call the guarded generate_procurement_orders_from_snapshot RPC.';

create function public.generate_procurement_orders_from_snapshot(
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
  v_supplier_ids uuid[];
begin
  select coalesce(array_agg(distinct supplier_id), '{}'::uuid[])
    into v_supplier_ids
  from unnest(coalesce(p_supplier_ids, '{}'::uuid[])) as requested(supplier_id)
  where supplier_id is not null;

  if cardinality(v_supplier_ids) = 0 then
    raise exception 'supplier selection is required' using errcode = '22023';
  end if;

  return public.generate_procurement_orders_from_snapshot_selected_unsafe(
    p_snapshot_id,
    p_expected_delivery_date,
    v_supplier_ids,
    p_created_by,
    p_created_by_name
  );
end;
$$;

comment on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text) is
  'Generate procurement orders only for an explicit, non-empty supplier selection. service_role only.';

revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text) from public;
revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text) from anon;
revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text) from authenticated;
grant execute on function public.generate_procurement_orders_from_snapshot(uuid, date, uuid[], text, text) to service_role;

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

comment on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) is
  'Deprecated compatibility RPC. Refuses generation without an explicit supplier.';

revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) from public;
revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) from anon;
revoke all on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) from authenticated;
grant execute on function public.generate_procurement_orders_from_snapshot(uuid, date, text, text) to service_role;
