-- Stage 23b — cutover to the visit-day plan. Apply together with the frontend that reads target_days / in_transit_qty.
-- Docs: docs/db/stage-23-visit-plan/
-- Applied in short separate statements (replacing a column on the 137k-row items table must not share one long transaction).

-- 1. reserve_status: generated-from-norm column -> plain column maintained by procurement_apply_plan().
alter table public.procurement_snapshot_items drop column reserve_status;
alter table public.procurement_snapshot_items add column reserve_status text;
create index idx_psi_snapshot_reserve_status on public.procurement_snapshot_items (snapshot_id, reserve_status);
comment on column public.procurement_snapshot_items.reserve_status is
  'no_demand | under_norm (stock+in transit < target) | on_norm | over_norm (> target + cycle). Set by procurement_apply_plan(); legacy value names kept.';

-- 2. Stock-health widget numbers come from reserve_status now.
create or replace function public.get_procurement_snapshot_stock_health(p_snapshot_id uuid)
returns table(total_count integer, no_demand_count integer, under_norm_count integer, on_norm_count integer, over_norm_count integer)
language sql
stable
set search_path = ''
as $$
  select
    count(*)::int,
    count(*) filter (where i.reserve_status = 'no_demand')::int,
    count(*) filter (where i.reserve_status = 'under_norm')::int,
    count(*) filter (where i.reserve_status = 'on_norm')::int,
    count(*) filter (where i.reserve_status = 'over_norm')::int
  from public.procurement_snapshot_items i
  where i.snapshot_id = p_snapshot_id;
$$;

-- 3. A snapshot that becomes ready (nightly sync) gets its plan computed with the default parameters.
create or replace function public.procurement_snapshot_ready_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.procurement_apply_plan(new.id);
  return null;
end;
$$;
revoke all on function public.procurement_snapshot_ready_plan() from public, anon, authenticated;

create trigger trg_procurement_snapshot_ready_plan
after update of status on public.procurement_snapshots
for each row
when (new.status = 'ready' and old.status is distinct from 'ready')
execute function public.procurement_snapshot_ready_plan();

-- 4. First computation for the latest snapshot:
--    select public.procurement_apply_plan((select id from public.procurement_snapshots order by created_at desc limit 1));
