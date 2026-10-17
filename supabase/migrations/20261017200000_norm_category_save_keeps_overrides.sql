-- Stage 16c: saving a category norm no longer overwrites items whose subcategory has its own norm.
--
-- Before: the RPC wrote the category norm to EVERY item of the category and the browser then re-applied each
-- subcategory override with separate requests (non-atomic: an interrupted save left overridden subcategories
-- on the category norm until the next sync). Now the category-level update skips items whose subcategory has an
-- explicit rule, in the same transaction. Signature, grants and the rest of the logic are unchanged.
--
-- Rollback: restore the previous body (see 20260810160315 / git history of this function) with
-- `or v_sub = ''` unconditional.

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
set search_path to ''
as $function$
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
      or (
        v_sub = ''
        and not exists (
          select 1
          from public.procurement_norm_rules as o
          where o.category_name = v_cat
            and o.subcategory_name <> ''
            and o.subcategory_name = i.subcategory_name
        )
      )
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
$function$;
