-- Procurement Planning v1 hardening (production advisors + service-role-only norm RPC).
-- Applied after 20260809071027_procurement_planning_v1 on environments that already ran v1.

select pg_advisory_xact_lock(202608090730);

-- Standalone FK covering indexes (advisors; composite snapshot_id+col is not enough).
create index if not exists idx_psi_platform_supplier_id
  on public.procurement_snapshot_items (platform_supplier_id);

create index if not exists idx_psi_generated_purchase_order_id
  on public.procurement_snapshot_items (generated_purchase_order_id);

-- Norm RPC: service_role only (Edge Function enforces procurement.edit).
-- Recreate without JWT permission gate so serviceClient.rpc works.
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

notify pgrst, 'reload schema';
