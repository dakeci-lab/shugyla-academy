-- Widens "on norm" from exact equality to a ±20% tolerance band, matching
-- the client-side compareReserveDaysToNorm change in
-- src/utils/procurementPlanningMath.js (STOCK_HEALTH_NORM_TOLERANCE).
--
-- Why: reserve days is round(calculation_stock / avg_daily) — a rounded
-- integer — compared against norm_days, a flat per-category target. Exact
-- equality is a near-impossible target for continuous data. Running this
-- function against the live production snapshot right after
-- 20260824090000 shipped showed on_norm_count = 88 of 7402 rated SKUs
-- (1.2%) against the owner's intended ~80% "точно" standard — the metric
-- was structurally unable to reach its target under strict equality.
--
-- Bucket boundaries now mirror compareReserveDaysToNorm exactly:
--   lower = norm_days * 0.8, upper = norm_days * 1.2
--   reserve < lower  -> under_norm (shortage risk)
--   lower <= reserve <= upper -> on_norm ("точно")
--   reserve > upper  -> over_norm (overstock)
--
-- Same no-new-privilege-surface note as 20260824090000: authenticated
-- already holds SELECT on procurement_snapshot_items, so this stays a plain
-- (non-SECURITY DEFINER) function.

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
      where i.avg_daily > 0
        and round(i.calculation_stock / i.avg_daily) < i.norm_days * 0.8
    )::int as under_norm_count,
    count(*) filter (
      where i.avg_daily > 0
        and round(i.calculation_stock / i.avg_daily) >= i.norm_days * 0.8
        and round(i.calculation_stock / i.avg_daily) <= i.norm_days * 1.2
    )::int as on_norm_count,
    count(*) filter (
      where i.avg_daily > 0
        and round(i.calculation_stock / i.avg_daily) > i.norm_days * 1.2
    )::int as over_norm_count
  from public.procurement_snapshot_items i
  where i.snapshot_id = p_snapshot_id;
$$;

grant execute on function public.get_procurement_snapshot_stock_health(uuid) to authenticated;
