-- Stage 23a — planning by supplier visit days (additive; nothing changes for the running app until stage 23b).
-- Docs: docs/db/stage-23-visit-plan/
--
-- Target stock at order time = (delivery date − today) + cycle to the next delivery + safety days, instead of a category norm.
-- «В пути» = items of orders that are not cancelled/received and whose expected delivery date is today or later.

alter table public.procurement_snapshot_items add column if not exists target_days integer;
alter table public.procurement_snapshot_items add column if not exists lead_days integer;
alter table public.procurement_snapshot_items add column if not exists cycle_days integer;
alter table public.procurement_snapshot_items add column if not exists in_transit_qty numeric not null default 0;
alter table public.procurement_snapshot_items add column if not exists plan_basis text;

create table if not exists public.procurement_supplier_plans (
  snapshot_id uuid not null references public.procurement_snapshots(id) on delete cascade,
  supplier_id uuid not null references public.platform_suppliers(id) on delete cascade,
  delivery_date date,
  safety_days integer not null default 1 check (safety_days between 0 and 30),
  skip_cycles integer not null default 0 check (skip_cycles between 0 and 3),
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (snapshot_id, supplier_id)
);
alter table public.procurement_supplier_plans enable row level security;
create policy procurement_supplier_plans_select_active_employee on public.procurement_supplier_plans
  for select to authenticated using (auth_private.current_employee_is_active());
revoke all on public.procurement_supplier_plans from anon, authenticated;
grant select on public.procurement_supplier_plans to authenticated;

-- JSON text like '["tue","fri"]' -> {2,5}; anything unparsable or empty -> {}
create or replace function public.procurement_weekdays(p_days text)
returns integer[]
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_days is null or btrim(p_days) = '' then return '{}'; end if;
  return coalesce((
    select array_agg(distinct n order by n)
    from (
      select case lower(x)
        when 'mon' then 1 when 'tue' then 2 when 'wed' then 3 when 'thu' then 4
        when 'fri' then 5 when 'sat' then 6 when 'sun' then 7 end as n
      from jsonb_array_elements_text(p_days::jsonb) as x
    ) q
    where n is not null
  ), '{}');
exception when others then
  return '{}';
end;
$$;

-- Plan parameters of one supplier for «today». basis: visit_days (delivery days known) | order_days_only | default_cycle (7 days).
create or replace function public.procurement_visit_params(
  p_supplier_id uuid,
  p_today date,
  p_delivery date default null,
  p_safety integer default 1,
  p_skip integer default 0
)
returns table (
  delivery_date date,
  lead_days integer,
  cycle_days integer,
  target_days integer,
  basis text,
  safety_days integer,
  skip_cycles integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_order integer[];
  v_deliv integer[];
  v_set integer[];
  v_delivery date;
  v_next date;
  v_cycle integer;
  v_basis text;
  v_safety integer := greatest(coalesce(p_safety, 1), 0);
  v_skip integer := least(greatest(coalesce(p_skip, 0), 0), 3);
  v_i integer;
begin
  select public.procurement_weekdays(s.order_days), public.procurement_weekdays(s.delivery_days)
    into v_order, v_deliv
  from public.platform_suppliers s
  where s.id = p_supplier_id;
  v_order := coalesce(v_order, '{}');
  v_deliv := coalesce(v_deliv, '{}');

  v_delivery := p_delivery;
  if v_delivery is null then
    v_delivery := p_today + 1;
    if cardinality(v_deliv) > 0 then
      for v_i in 1..7 loop
        if extract(isodow from p_today + v_i)::int = any (v_deliv) then
          v_delivery := p_today + v_i;
          exit;
        end if;
      end loop;
    end if;
  end if;
  if v_delivery < p_today then v_delivery := p_today; end if;

  v_set := case when cardinality(v_deliv) > 0 then v_deliv else v_order end;
  v_cycle := 7;
  if cardinality(v_set) > 0 then
    for v_i in 1..7 loop
      if extract(isodow from v_delivery + v_i)::int = any (v_set) then
        v_cycle := v_i;
        exit;
      end if;
    end loop;
  end if;
  v_basis := case
    when cardinality(v_deliv) > 0 then 'visit_days'
    when cardinality(v_order) > 0 then 'order_days_only'
    else 'default_cycle' end;

  return query select
    v_delivery,
    (v_delivery - p_today)::int,
    v_cycle * (1 + v_skip),
    (v_delivery - p_today)::int + v_cycle * (1 + v_skip) + v_safety,
    v_basis,
    v_safety,
    v_skip;
end;
$$;

-- Recompute target / in-transit / recommendation / status for a snapshot (all suppliers) or one supplier.
-- Manual quantities and items already turned into an order keep their final_order_qty.
create or replace function public.procurement_apply_plan(p_snapshot_id uuid, p_supplier_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Aqtobe')::date;
  v_updated integer;
begin
  with sup as (
    select distinct i.platform_supplier_id as sid
    from public.procurement_snapshot_items i
    where i.snapshot_id = p_snapshot_id
      and (p_supplier_id is null or i.platform_supplier_id = p_supplier_id)
  ),
  params as (
    select s.sid, vp.*
    from sup s
    left join public.procurement_supplier_plans pl
      on pl.snapshot_id = p_snapshot_id and pl.supplier_id = s.sid
    cross join lateral public.procurement_visit_params(s.sid, v_today, pl.delivery_date, pl.safety_days, pl.skip_cycles) vp
  ),
  transit as (
    select poi.barcode, sum(poi.ordered_qty) as qty
    from public.purchase_order_items poi
    join public.purchase_orders po on po.id = poi.purchase_order_id
    where po.status not in ('cancelled', 'received')
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
        else 'on_norm' end as status
    from public.procurement_snapshot_items i
    join params pr on pr.sid is not distinct from i.platform_supplier_id
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
      final_order_qty = case when i.manual_override or i.generated_purchase_order_id is not null
                             then i.final_order_qty else c.rec end,
      plan_status = c.status
  from calc c
  where i.id = c.id;
  get diagnostics v_updated = row_count;

  update public.procurement_snapshots s
  set orderable_count = (
    select count(*) from public.procurement_snapshot_items i
    where i.snapshot_id = p_snapshot_id and i.recommended_qty > 0)
  where s.id = p_snapshot_id;

  return v_updated;
end;
$$;
revoke all on function public.procurement_apply_plan(uuid, uuid) from public, anon, authenticated;
grant execute on function public.procurement_apply_plan(uuid, uuid) to service_role;

-- Supplier summary for the planner header (no writes).
create or replace function public.procurement_supplier_plan(p_snapshot_id uuid, p_supplier_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Aqtobe')::date;
  v_plan public.procurement_supplier_plans;
  v_vp record;
  v_min numeric;
  v_total numeric;
  v_orderable integer;
begin
  if not auth_private.current_employee_is_active() then
    raise exception 'Требуется вход в систему' using errcode = '42501';
  end if;
  select * into v_plan from public.procurement_supplier_plans
   where snapshot_id = p_snapshot_id and supplier_id = p_supplier_id;
  select * into v_vp from public.procurement_visit_params(
    p_supplier_id, v_today, v_plan.delivery_date, v_plan.safety_days, v_plan.skip_cycles);
  select s.min_order_amount into v_min from public.platform_suppliers s where s.id = p_supplier_id;
  select coalesce(sum(i.final_order_qty * i.purchase_price), 0),
         count(*) filter (where i.final_order_qty > 0)
    into v_total, v_orderable
  from public.procurement_snapshot_items i
  where i.snapshot_id = p_snapshot_id and i.platform_supplier_id = p_supplier_id;
  return jsonb_build_object(
    'today', v_today,
    'deliveryDate', v_vp.delivery_date,
    'deliveryDateIsCustom', v_plan.delivery_date is not null,
    'leadDays', v_vp.lead_days,
    'cycleDays', v_vp.cycle_days,
    'targetDays', v_vp.target_days,
    'basis', v_vp.basis,
    'safetyDays', v_vp.safety_days,
    'skipCycles', v_vp.skip_cycles,
    'minOrderAmount', v_min,
    'orderTotal', v_total,
    'orderableCount', v_orderable
  );
end;
$$;
revoke all on function public.procurement_supplier_plan(uuid, uuid) from public, anon;
grant execute on function public.procurement_supplier_plan(uuid, uuid) to authenticated, service_role;

-- Buyer changes the plan of one supplier (delivery date, safety days, «skip a visit») and gets the recomputed items.
create or replace function public.procurement_plan_supplier(
  p_snapshot_id uuid,
  p_supplier_id uuid,
  p_delivery_date date default null,
  p_safety_days integer default 1,
  p_skip_cycles integer default 0,
  p_updated_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  perform auth_private.require_procurement_edit();
  select s.status into v_status from public.procurement_snapshots s where s.id = p_snapshot_id;
  if v_status is null or v_status not in ('ready', 'partially_generated', 'generated') then
    raise exception 'Снимок планирования недоступен для изменения' using errcode = '42501';
  end if;
  insert into public.procurement_supplier_plans as pl
    (snapshot_id, supplier_id, delivery_date, safety_days, skip_cycles, updated_by, updated_at)
  values (p_snapshot_id, p_supplier_id, p_delivery_date,
          greatest(coalesce(p_safety_days, 1), 0), least(greatest(coalesce(p_skip_cycles, 0), 0), 3),
          p_updated_by, now())
  on conflict (snapshot_id, supplier_id) do update
    set delivery_date = excluded.delivery_date,
        safety_days = excluded.safety_days,
        skip_cycles = excluded.skip_cycles,
        updated_by = excluded.updated_by,
        updated_at = now();
  perform public.procurement_apply_plan(p_snapshot_id, p_supplier_id);
  return public.procurement_supplier_plan(p_snapshot_id, p_supplier_id);
end;
$$;
revoke all on function public.procurement_plan_supplier(uuid, uuid, date, integer, integer, text) from public, anon;
grant execute on function public.procurement_plan_supplier(uuid, uuid, date, integer, integer, text) to authenticated, service_role;
