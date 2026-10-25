-- Stage 23b — cutover to the visit-day plan (applied on prod 2026-10-25 in short separate statements).
-- Docs: docs/db/stage-23-visit-plan/
--
-- reserve_status (generated from the category norm) is NOT dropped here — dropping a column needs an interactive confirmation in the MCP
-- tool. A plain plan_status column carries the new status instead; the dead reserve_status goes away together with the norms.

alter table public.procurement_snapshot_items add column if not exists plan_status text;
create index if not exists idx_psi_snapshot_plan_status on public.procurement_snapshot_items (snapshot_id, plan_status);
comment on column public.procurement_snapshot_items.plan_status is
  'no_demand | under_norm (stock + in transit < target) | on_norm | over_norm (> target + cycle). Set by procurement_apply_plan(); legacy value names kept. '
  'Replaces the norm-based generated reserve_status, which is dead and will be dropped with the norms.';

-- procurement_apply_plan() (stage 23a) is re-created to write plan_status instead of reserve_status — see the live definition.

create or replace function public.get_procurement_snapshot_stock_health(p_snapshot_id uuid)
returns table(total_count integer, no_demand_count integer, under_norm_count integer, on_norm_count integer, over_norm_count integer)
language sql
stable
set search_path = ''
as $$
  select
    count(*)::int,
    count(*) filter (where i.plan_status = 'no_demand')::int,
    count(*) filter (where i.plan_status = 'under_norm')::int,
    count(*) filter (where i.plan_status = 'on_norm')::int,
    count(*) filter (where i.plan_status = 'over_norm')::int
  from public.procurement_snapshot_items i
  where i.snapshot_id = p_snapshot_id;
$$;

-- A snapshot that becomes ready (nightly sync) gets its plan computed with the default parameters.
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

-- First computation (done on prod): select public.procurement_apply_plan(<latest snapshot id>);  -> 8602 items.
