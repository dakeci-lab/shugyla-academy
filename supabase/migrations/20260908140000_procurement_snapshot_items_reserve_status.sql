-- Owner-approved drill-down for the "Соответствие норме запаса" widget:
-- clicking a bucket (Точно / Перезатарка / Недостаток / Нет данных) filters
-- the existing Планирование table to just that bucket's SKUs, instead of
-- opening a new query path or a new list component.
--
-- Adds a STORED GENERATED column that classifies every row into the same
-- four buckets as get_procurement_snapshot_stock_health() — same predicate,
-- same ±20% tolerance band — see
-- 20260824100000_procurement_snapshot_stock_health_tolerance.sql. Once this
-- column exists, a bucket click is a plain `.eq('reserve_status', bucket)`
-- filter through the existing fetchSnapshotItemsPage/applySnapshotItemsPageQuery
-- path — no new RPC, no new table.
--
-- The expression only uses numeric division and round(numeric), both
-- immutable, so Postgres can store and index it like any other column.
-- Existing rows are backfilled as part of this ALTER TABLE — a full table
-- rewrite — hence the more generous timeouts than this project's usual
-- lightweight permission-only migrations.

set lock_timeout = '10s';
set statement_timeout = '120s';

alter table public.procurement_snapshot_items
  add column if not exists reserve_status text generated always as (
    case
      when avg_daily <= 0 then 'no_demand'
      when round(calculation_stock / avg_daily) < norm_days * 0.8 then 'under_norm'
      when round(calculation_stock / avg_daily) > norm_days * 1.2 then 'over_norm'
      else 'on_norm'
    end
  ) stored;

comment on column public.procurement_snapshot_items.reserve_status is
  'Stock-health bucket for this row: no_demand | under_norm | on_norm | over_norm. '
  'Generated — mirrors get_procurement_snapshot_stock_health() exactly (same ±20% '
  'tolerance band). Not writable; do not target it in application writes.';

create index if not exists idx_psi_snapshot_reserve_status
  on public.procurement_snapshot_items (snapshot_id, reserve_status);
