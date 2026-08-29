-- «Склад» history table (ProcurementWarehouseView) needs a net stock-value
-- total per snapshot row — Σ(raw_stock * price), which nets negative-stock
-- rows against positive ones automatically since raw_stock is signed.
--
-- A snapshot holds 8-10k SKUs, so summing client-side per history row (20
-- rows/page) would mean re-fetching 160k+ item rows on every page load.
-- Aggregating for the whole page in one round trip instead.
--
-- Same no-new-privilege-surface note as get_procurement_snapshot_stock_health
-- (20260824090000/20260824100000): authenticated already holds a plain
-- SELECT grant on procurement_snapshot_items and the
-- procurement_snapshot_items_select_view RLS policy applies unchanged, so
-- this stays a plain (non-SECURITY DEFINER) function — no FOR SHARE/UPDATE
-- involved, unlike the trigger bug described in CLAUDE.md section 8.0.

create or replace function public.get_procurement_snapshot_totals(p_snapshot_ids uuid[])
returns table (
  snapshot_id uuid,
  total_purchase_value numeric,
  total_selling_value numeric
)
language sql
stable
set search_path = ''
as $$
  select
    i.snapshot_id,
    coalesce(sum(i.raw_stock * i.purchase_price), 0)::numeric(16, 2) as total_purchase_value,
    coalesce(sum(i.raw_stock * i.selling_price), 0)::numeric(16, 2) as total_selling_value
  from public.procurement_snapshot_items i
  where i.snapshot_id = any(p_snapshot_ids)
  group by i.snapshot_id;
$$;

grant execute on function public.get_procurement_snapshot_totals(uuid[]) to authenticated;
