-- Stage 22 rollback: drop the marks (the grant goes with the columns). Loses only the «сверено» marks.
alter table public.purchase_orders drop column checked_at;
alter table public.purchase_orders drop column checked_by_name;
