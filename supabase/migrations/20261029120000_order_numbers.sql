-- Stage 1 of «Закуп как документы»: a document number for orders (docs/procurement/purchase-documents/PLAN.md).
-- The number is given when an order becomes «saved» (any path: «Сохранить», creation from the plan), starts at 1001, never changes
-- (cancelling a saved order back to a draft keeps it) and is never reused, so deleted drafts leave no gaps.

alter table public.purchase_orders add column number integer;

create sequence public.purchase_order_number_seq as integer start with 1001 minvalue 1001;

-- Existing saved orders get numbers in creation order.
update public.purchase_orders as o
   set number = n.rn
  from (
    select id, (1000 + row_number() over (order by created_at, id))::integer as rn
    from public.purchase_orders
    where status = 'saved'
  ) as n
 where o.id = n.id;

select setval('public.purchase_order_number_seq', greatest(1001, coalesce((select max(number) + 1 from public.purchase_orders), 1001)), false);

create unique index purchase_orders_number_key on public.purchase_orders (number) where number is not null;

create or replace function public.purchase_orders_assign_number()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status = 'saved' and new.number is null then
    new.number := nextval('public.purchase_order_number_seq');
  end if;
  return new;
end;
$function$;

create trigger purchase_orders_assign_number
  before insert or update of status on public.purchase_orders
  for each row execute function public.purchase_orders_assign_number();
