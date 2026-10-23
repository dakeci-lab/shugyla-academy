-- Stop writing the service comment «Сформировано из планирования закупок» into new orders.
--
-- generate_procurement_orders_from_snapshot (7-argument version, the one the planner calls) inserted that
-- phrase into purchase_orders.comment and receiving_documents.comment. The receiver reads orders as a
-- delivery document, where the phrase is noise; the frontend already treats it as an empty comment
-- (orderCommentForDisplay), existing rows are left as they are.
--
-- The function body is long and changed over several migrations, so it is patched in place: take the live
-- definition, replace the two string literals with an empty string, re-create. Grants, SECURITY DEFINER and
-- search_path come back unchanged because pg_get_functiondef includes them.
-- Docs: docs/db/stage-21-orders-no-auto-comment/

do $$
declare
  v_oid oid;
  v_def text;
  v_before int;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'generate_procurement_orders_from_snapshot'
    and pg_get_function_identity_arguments(p.oid) =
      'p_snapshot_id uuid, p_expected_delivery_date date, p_supplier_ids uuid[], p_created_by text, p_created_by_name text, p_attempt_key uuid, p_payload_fingerprint text';
  if v_oid is null then
    raise exception 'generate_procurement_orders_from_snapshot (7 args) not found';
  end if;

  v_def := pg_get_functiondef(v_oid);
  v_before := (length(v_def) - length(replace(v_def, '''Сформировано из планирования закупок''', '')))
    / length('''Сформировано из планирования закупок''');
  if v_before <> 2 then
    raise exception 'expected 2 occurrences of the service comment, found %', v_before;
  end if;

  execute replace(v_def, '''Сформировано из планирования закупок''', '''''');
end
$$;
