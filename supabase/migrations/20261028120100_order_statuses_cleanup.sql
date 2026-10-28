-- Stage 25b (part 2): destructive cleanup, run by the owner in the Supabase SQL Editor (one transaction, no CASCADE, no IF EXISTS).
-- Precondition: part 1 (20261028120000_order_statuses_cutover.sql) applied; the only non-«saved»/«draft» orders left are the 20 cancelled.
begin;

-- 1) the 20 cancelled orders go away (their items follow through the existing foreign key; snapshot pointers are set to null)
delete from public.purchase_orders where status = 'cancelled';

-- 2) only two statuses can exist from now on
alter table public.purchase_orders
  add constraint purchase_orders_status_check check (status in ('draft', 'saved'));

-- 3) direct edits of orders are closed: drafts through the *_draft policies, everything else through the server functions.
--    purchase_orders_insert_simple stays (a manually created order is inserted as a draft).
drop policy purchase_orders_update_simple on public.purchase_orders;
drop policy purchase_orders_delete_simple on public.purchase_orders;
drop policy purchase_order_items_insert_simple on public.purchase_order_items;
drop policy purchase_order_items_update_simple on public.purchase_order_items;
drop policy purchase_order_items_delete_simple on public.purchase_order_items;

commit;
