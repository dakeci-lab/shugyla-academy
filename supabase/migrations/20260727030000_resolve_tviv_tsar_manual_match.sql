-- Manual resolve: TVIV Царь pending_manual_review
-- Same counterparty (ИП Танеев / TVIV Царь). Survivor = UMAG-linked row.
-- Local-only duplicate is soft-merged; PO/Receiving remapped; ops contact preserved in comment.

select pg_advisory_xact_lock(202607270300);

do $$
declare
  v_candidate_id uuid := '20e19483-c6e9-4a6c-b084-a5da0d51d3d0';
  v_local_id uuid := 'f355b150-f1a3-460f-9e6d-d4ed3f7446b0';
  v_survivor_id uuid := 'c6fdc465-1d9f-44db-b90b-ca8df3b16470';
  v_umag_supplier_id bigint := 230116;
  v_local record;
  v_survivor record;
  v_note text;
  v_po int;
  v_recv int;
begin
  select * into v_local
  from public.platform_suppliers
  where id = v_local_id
    and coalesce(is_merged, false) = false
    and umag_supplier_id is null;

  select * into v_survivor
  from public.platform_suppliers
  where id = v_survivor_id
    and coalesce(is_merged, false) = false
    and umag_supplier_id = v_umag_supplier_id;

  if v_local.id is null or v_survivor.id is null then
    raise notice 'tviv_tsar_manual_merge skipped: rows missing or already merged';
    return;
  end if;

  if not exists (
    select 1
    from public.supplier_umag_match_candidates
    where id = v_candidate_id
      and status = 'pending_manual_review'
      and platform_supplier_id = v_local_id
      and umag_supplier_id = v_umag_supplier_id
  ) then
    raise notice 'tviv_tsar_manual_merge skipped: candidate not pending';
    return;
  end if;

  -- Preserve local-only operational contact when it differs from survivor
  v_note := trim(both from concat_ws(
    E'\n',
    nullif(trim(coalesce(v_survivor.comment, '')), ''),
    case
      when coalesce(nullif(trim(v_local.manager_name), ''), '') <> ''
        or coalesce(nullif(trim(v_local.manager_phone), ''), '') <> ''
        or coalesce(nullif(trim(v_local.delivery_days), ''), '') not in ('', '[]', 'null')
      then
        'Альт. контакт (merged TVIV Царь): '
        || coalesce(nullif(trim(v_local.manager_name), ''), '—')
        || ' '
        || coalesce(nullif(trim(v_local.manager_phone), ''), '')
        || case
          when coalesce(nullif(trim(v_local.delivery_days), ''), '') not in ('', '[]', 'null')
            then '; delivery_days=' || v_local.delivery_days
          else ''
        end
        || case
          when coalesce(nullif(trim(v_local.order_days), ''), '') not in ('', '[]', 'null')
            then '; order_days=' || v_local.order_days
          else ''
        end
      else null
    end
  ));

  update public.platform_suppliers
  set comment = nullif(v_note, '')
  where id = v_survivor_id;

  update public.purchase_orders
  set supplier_id = v_survivor_id
  where supplier_id = v_local_id;
  get diagnostics v_po = row_count;

  update public.receiving_documents
  set supplier_id = v_survivor_id
  where supplier_id = v_local_id;
  get diagnostics v_recv = row_count;

  update public.umag_supplies
  set platform_supplier_id = v_survivor_id
  where platform_supplier_id = v_local_id;

  update public.supplier_reconciliations
  set supplier_id = v_survivor_id
  where supplier_id = v_local_id;

  update public.platform_suppliers
  set
    is_merged = true,
    merged_into_supplier_id = v_survivor_id,
    merged_at = now(),
    status = 'archived'
  where id = v_local_id;

  update public.supplier_umag_match_candidates
  set status = 'accepted'
  where id = v_candidate_id;

  raise notice
    'tviv_tsar_manual_merge survivor=% local_merged=% po_remapped=% recv_remapped=%',
    v_survivor_id, v_local_id, v_po, v_recv;
end $$;
