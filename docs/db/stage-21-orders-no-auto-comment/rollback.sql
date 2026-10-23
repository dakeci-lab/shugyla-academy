-- Stage 21 rollback: put the service comment «Сформировано из планирования закупок» back.
-- Exact inverse of the migration (checked 2026-10-23: patch + this restore reproduce the original definition byte for byte, md5 equal).
do $$
declare
  v_oid oid;
  v_def text;
  v_n int;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'generate_procurement_orders_from_snapshot'
    and pg_get_function_identity_arguments(p.oid) =
      'p_snapshot_id uuid, p_expected_delivery_date date, p_supplier_ids uuid[], p_created_by text, p_created_by_name text, p_attempt_key uuid, p_payload_fingerprint text';
  if v_oid is null then raise exception 'function not found'; end if;
  v_def := pg_get_functiondef(v_oid);
  v_n := (select count(*) from regexp_matches(v_def, 'p_created_by_name,\s+''''(,)', 'g'));
  if v_n <> 2 then raise exception 'expected 2 empty comment literals, found %', v_n; end if;
  execute regexp_replace(v_def, '(p_created_by_name,\s+)''''(,)', '\1''Сформировано из планирования закупок''\2', 'g');
end $$;
