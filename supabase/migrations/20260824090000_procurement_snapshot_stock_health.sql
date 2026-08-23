-- Read-only aggregate for the planner's stock-health widget (owner-requested
-- retail standard: 80% of SKUs on norm, up to 10% overstock, up to 10%
-- understock — ties into procurement buyer KPI/bonus, so this must be a
-- single server-computed source of truth, not a client-side scan that could
-- drift between users or go stale mid-session).
--
-- Buckets mirror src/utils/procurementPlanningMath.js's
-- calcReserveDays/compareReserveDaysToNorm exactly:
--   reserve = round(calculation_stock / avg_daily), compared against norm_days.
-- Items with avg_daily <= 0 have no demand signal (shown as "—" in the
-- table) and are reported separately — they are NOT part of the 80/10/10
-- denominator.
--
-- Deliberately computed on demand, not cached on procurement_snapshots at
-- sync time: editing a norm via the "Нормы" tab propagates onto
-- procurement_snapshot_items.norm_days immediately
-- (set_procurement_norm_rule_for_snapshot), between UMAG syncs. A
-- sync-time-cached percentage would go stale the moment a norm changes;
-- computing fresh on each read never can.
--
-- No SECURITY DEFINER: `authenticated` already holds a plain SELECT grant on
-- procurement_snapshot_items (20260809072915_procurement_planning_v1.sql:643),
-- so this function runs with the caller's own privileges and the existing
-- procurement_snapshot_items_select_view RLS policy (same file, line 669)
-- applies unchanged — no new privilege surface.

create or replace function public.get_procurement_snapshot_stock_health(p_snapshot_id uuid)
returns table (
  total_count int,
  no_demand_count int,
  under_norm_count int,
  on_norm_count int,
  over_norm_count int
)
language sql
stable
set search_path = ''
as $$
  select
    count(*)::int as total_count,
    count(*) filter (where i.avg_daily <= 0)::int as no_demand_count,
    count(*) filter (
      where i.avg_daily > 0 and round(i.calculation_stock / i.avg_daily) < i.norm_days
    )::int as under_norm_count,
    count(*) filter (
      where i.avg_daily > 0 and round(i.calculation_stock / i.avg_daily) = i.norm_days
    )::int as on_norm_count,
    count(*) filter (
      where i.avg_daily > 0 and round(i.calculation_stock / i.avg_daily) > i.norm_days
    )::int as over_norm_count
  from public.procurement_snapshot_items i
  where i.snapshot_id = p_snapshot_id;
$$;

grant execute on function public.get_procurement_snapshot_stock_health(uuid) to authenticated;
