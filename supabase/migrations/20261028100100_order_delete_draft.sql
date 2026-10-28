-- Stage 25a (part 2): permanent deletion of a draft. Contains DELETE statements, so it is run by the owner in the
-- Supabase SQL Editor (the MCP connector asks for a confirmation that never arrives).
-- 4) Удаление черновика насовсем. A draft from the planner gives its quantities back to the plan.
create or replace function public.procurement_delete_draft_order(p_order_id uuid)
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
    return jsonb_build_object('order_id', p_order_id, 'changed', false);
  end if;
  if v_order.status <> 'draft' then
    raise exception 'Удалить можно только черновик. Сначала отмените сохранённый заказ' using errcode = '55000';
  end if;

  if v_order.workflow_mode = 'analytics' and v_order.source_snapshot_id is not null then
    begin
      update public.procurement_snapshot_items as i
         set final_order_qty = poi.ordered_qty,
             manual_override = true,
             generated_purchase_order_id = null,
             updated_at = now()
        from public.purchase_order_items as poi
       where poi.purchase_order_id = p_order_id
         and i.snapshot_id = v_order.source_snapshot_id
         and i.barcode = poi.barcode
         and i.generated_purchase_order_id = p_order_id
         and i.final_order_qty = 0;
    exception when others then
      -- the snapshot is no longer a working one: nothing to give back
      null;
    end;
  end if;

  delete from public.receiving_documents where purchase_order_id = p_order_id;
  delete from public.purchase_orders where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'changed', true);
end;
$function$;

revoke all on function public.procurement_delete_draft_order(uuid) from public, anon;
grant execute on function public.procurement_delete_draft_order(uuid) to authenticated;
