-- Stage 22: «сверено приёмщиком» mark on purchase orders.
-- The receiver ticks items one by one while checking a delivery against the paper invoice; when everything
-- matches they mark the whole order as checked, and the orders list shows it. Two nullable columns, no
-- backfill (nothing was checked before). Only these two columns are added to the authenticated UPDATE grant.
-- Docs: docs/db/stage-22-orders-checked-mark/
alter table public.purchase_orders add column checked_at timestamptz;
alter table public.purchase_orders add column checked_by_name text;
grant update (checked_at, checked_by_name) on public.purchase_orders to authenticated;
