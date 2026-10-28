-- Stage 25c (part 1, additive): the order transition functions no longer touch receiving documents.
create or replace function public.procurement_unsave_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.purchase_orders;
begin
  if p_order_id is null then
    raise exception 'Заказ не найден' using errcode = '22004';
  end if;
  perform auth_private.require_procurement_edit();

  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if not found then
    raise exception 'Заказ не найден' using errcode = '22004';
  end if;

  if v_order.status = 'draft' then
    return jsonb_build_object('order_id', p_order_id, 'status', 'draft', 'changed', false);
  end if;

  update public.purchase_orders
     set status = 'draft',
         checked_at = null,
         checked_by_name = null,
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'status', 'draft', 'changed', true);
end;
$function$;

create or replace function public.procurement_submit_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.purchase_orders;
  v_count integer;
  v_zero integer;
  v_total numeric;
begin
  if p_order_id is null then
    raise exception 'Заказ не найден' using errcode = '22004';
  end if;
  perform auth_private.require_procurement_edit();

  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if not found then
    raise exception 'Заказ не найден' using errcode = '22004';
  end if;

  if v_order.status <> 'draft' then
    return jsonb_build_object('order_id', p_order_id, 'status', v_order.status, 'changed', false);
  end if;

  select count(*), count(*) filter (where coalesce(ordered_qty, 0) <= 0)
    into v_count, v_zero
  from public.purchase_order_items where purchase_order_id = p_order_id;

  if v_count = 0 then
    raise exception 'В заказе нет товаров. Добавьте товары или удалите черновик' using errcode = '22023';
  end if;
  if v_zero > 0 then
    raise exception 'В заказе есть товары с нулевым количеством. Исправьте или удалите их' using errcode = '22023';
  end if;

  update public.purchase_order_items
     set total_amount = round(coalesce(ordered_qty, 0) * coalesce(purchase_price, 0), 2)
   where purchase_order_id = p_order_id;

  select coalesce(sum(total_amount), 0) into v_total
  from public.purchase_order_items where purchase_order_id = p_order_id;

  update public.purchase_orders
     set status = 'saved',
         items_count = v_count,
         total_amount = v_total,
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'status', 'saved', 'changed', true,
                            'items_count', v_count, 'total_amount', v_total);
end;
$function$;
