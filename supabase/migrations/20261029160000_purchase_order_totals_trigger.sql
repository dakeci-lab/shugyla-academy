-- Order totals (total_amount, items_count) are kept by the database itself: one statement-level trigger per kind of change on
-- purchase_order_items. The client used to read all items and write the totals back after every add / edit / removal
-- (two extra round trips each time) and could leave stale totals if the connection dropped between the two writes.
-- Additive: new function and three triggers; the existing client recalculation stays harmless (it writes the same numbers).

create or replace function public.purchase_order_items_recalc_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.purchase_orders po
  set total_amount = coalesce(s.total, 0),
      items_count = coalesce(s.cnt, 0)
  from (select distinct purchase_order_id as id from changed) c
  left join lateral (
    select sum(i.total_amount) as total, count(*) as cnt
    from public.purchase_order_items i
    where i.purchase_order_id = c.id
  ) s on true
  where po.id = c.id;
  return null;
end;
$function$;

create trigger purchase_order_items_totals_ins
  after insert on public.purchase_order_items
  referencing new table as changed
  for each statement execute function public.purchase_order_items_recalc_totals();

create trigger purchase_order_items_totals_upd
  after update on public.purchase_order_items
  referencing new table as changed
  for each statement execute function public.purchase_order_items_recalc_totals();

create trigger purchase_order_items_totals_del
  after delete on public.purchase_order_items
  referencing old table as changed
  for each statement execute function public.purchase_order_items_recalc_totals();
