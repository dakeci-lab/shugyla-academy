-- Native "Оплачено" marking now writes its own entry directly into
-- platform_supplier_ledger_events (external_source = 'platform') instead of
-- relying on UMAG's own document-payment feed, which became untrustworthy
-- once staff started marking UMAG documents paid immediately at receiving
-- time (see docs discussion: «Взаиморасчёты» showed the receiving moment as
-- the payment date/account instead of the real "Оплачено" click).
--
-- Clients may only ever insert/update/delete rows tagged external_source =
-- 'platform' — UMAG-sourced history (external_source = 'umag', written only
-- by the umag-sync Edge Function's service_role client) stays untouchable
-- from the client.

grant insert, update, delete on table public.platform_supplier_ledger_events to authenticated;

drop policy if exists platform_supplier_ledger_events_insert_platform on public.platform_supplier_ledger_events;
create policy platform_supplier_ledger_events_insert_platform
  on public.platform_supplier_ledger_events
  for insert
  to authenticated
  with check (
    external_source = 'platform'
    and (
      auth_private.current_user_has_permission('supplier_payments.manage')
      or auth_private.current_user_has_permission('suppliers.edit')
    )
  );

drop policy if exists platform_supplier_ledger_events_update_platform on public.platform_supplier_ledger_events;
create policy platform_supplier_ledger_events_update_platform
  on public.platform_supplier_ledger_events
  for update
  to authenticated
  using (
    external_source = 'platform'
    and (
      auth_private.current_user_has_permission('supplier_payments.manage')
      or auth_private.current_user_has_permission('suppliers.edit')
    )
  )
  with check (
    external_source = 'platform'
    and (
      auth_private.current_user_has_permission('supplier_payments.manage')
      or auth_private.current_user_has_permission('suppliers.edit')
    )
  );

drop policy if exists platform_supplier_ledger_events_delete_platform on public.platform_supplier_ledger_events;
create policy platform_supplier_ledger_events_delete_platform
  on public.platform_supplier_ledger_events
  for delete
  to authenticated
  using (
    external_source = 'platform'
    and (
      auth_private.current_user_has_permission('supplier_payments.manage')
      or auth_private.current_user_has_permission('suppliers.edit')
    )
  );
