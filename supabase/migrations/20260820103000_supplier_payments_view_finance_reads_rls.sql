-- Этап 3.1 (F-2): align RLS with supplier_payments.view for finance reads.
--
-- Payments-only users already see supplier_payment_obligations via
-- supplier_payments.view. Without this, umag_document_payments and
-- umag_sync_runs silently return [] / deny SELECT, producing fake
-- "Оплачено = 0 ₸" and "ещё не синхронизировано".
--
-- Read-only: does NOT grant umag.settlements.sync or settlements.view.

drop policy if exists umag_document_payments_select_view on public.umag_document_payments;
create policy umag_document_payments_select_view
  on public.umag_document_payments
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('umag.settlements.view')
    or auth_private.current_user_has_permission('suppliers.view')
    or auth_private.current_user_has_permission('supplier_payments.view')
  );

drop policy if exists umag_sync_runs_select_view on public.umag_sync_runs;
create policy umag_sync_runs_select_view
  on public.umag_sync_runs
  for select
  to authenticated
  using (
    auth_private.current_user_has_permission('umag.settlements.view')
    or auth_private.current_user_has_permission('umag.settlements.sync')
    or auth_private.current_user_has_permission('supplier_payments.view')
  );
