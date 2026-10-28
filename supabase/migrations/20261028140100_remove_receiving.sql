-- Stage 25c (part 2, destructive): remove the receiving module from the database. Run by the owner in the Supabase SQL Editor,
-- AFTER the frontend without receiving is deployed. One transaction, no CASCADE, no IF EXISTS.
-- The receiving-discrepancy-photos bucket is empty (0 objects); it is removed in the dashboard (Storage) — storage tables refuse direct deletes.
begin;

-- 1) deleting a draft no longer has receiving documents to clean up
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
      null;
    end;
  end if;

  delete from public.purchase_orders where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'changed', true);
end;
$function$;

-- 2) policies of the discrepancy-photos bucket (they reference the receiving tables)
drop policy receiving_discrepancy_photos_delete on storage.objects;
drop policy receiving_discrepancy_photos_insert on storage.objects;
drop policy receiving_discrepancy_photos_select on storage.objects;

-- 3) tables, children first
drop table public.receiving_umag_exports;
drop table public.receiving_document_versions;
drop table public.receiving_items;
drop table public.receiving_documents;

-- 4) functions
drop function public.receiving_complete_v1(uuid, bigint, text[], jsonb);
drop function public.receiving_save_v1(uuid, bigint, text[], jsonb);
drop function public.receiving_start_v1(uuid, bigint);
drop function public.receiving_record_umag_export_v1(uuid, bigint, bigint, text, integer, numeric, numeric, text);
drop function public.receiving_items_fill_unit_v1();
drop function auth_private.receiving_apply_v1(uuid, bigint, text[], jsonb, boolean);
drop function auth_private.receiving_document_is_simple(uuid);
drop function auth_private.require_receiving_manage_v1();
drop function auth_private.purchase_order_is_simple(uuid);
drop function public.procurement_cancel_order(uuid);
drop function public.procurement_return_order_to_draft(uuid);

-- 5) order columns that pointed at the receiving documents
alter table public.purchase_orders drop column transferred_to_receiving;
alter table public.purchase_orders drop column receiving_document_id;

commit;
