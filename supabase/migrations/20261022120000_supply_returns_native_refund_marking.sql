-- Native «Возврат получен» marking for supplier returns, independent of UMAG.
--
-- Context: by owner policy staff close documents in UMAG immediately at entry,
-- so umag_supply_returns.payed_amount equals amount from day one (208 of 209
-- rows at the time of writing) and says nothing about whether the supplier
-- has actually sent the money back. Same situation as supplies, solved the
-- same way (see 20260915090000_native_supplier_payment_marking.sql): a native
-- mark in Shugyla that a UMAG sync never touches.
--
-- Money flow stays two independent streams, no netting: supplies = money OUT
-- (platform_paid_at), returns = money IN (platform_refunded_at).
--
-- Backfill: every return that exists now is old and already settled — marked
-- received by the director (academy_users id 1) at the return's own date.
-- Docs: docs/db/stage-18-returns-refund-marking/

select pg_advisory_xact_lock(202610221200);

alter table public.umag_supply_returns
  add column platform_refunded_at timestamptz null,
  add column platform_refunded_by bigint null references public.academy_users(id) on delete set null,
  add column platform_refund_account_id uuid null references public.payment_accounts(id);

create index idx_umag_supply_returns_platform_refunded_at
  on public.umag_supply_returns (platform_refunded_at)
  where platform_refunded_at is null and is_source_deleted = false;
create index idx_umag_supply_returns_platform_refund_account_id
  on public.umag_supply_returns (platform_refund_account_id);
create index idx_umag_supply_returns_platform_refunded_by
  on public.umag_supply_returns (platform_refunded_by);

comment on column public.umag_supply_returns.platform_refunded_at is
  'Set when the supplier''s money for this return is marked received natively in Shugyla. UMAG payed_amount is NOT consulted (closed in UMAG at entry by policy). A UMAG sync never clears it; cleared only by explicitly un-marking.';
comment on column public.umag_supply_returns.platform_refunded_by is
  'academy_users.id of whoever marked the refund received (or un-marked it) last.';
comment on column public.umag_supply_returns.platform_refund_account_id is
  'payment_accounts.id the refund money arrived on.';

-- Backfill: all existing returns are old and settled — director, at return date.
update public.umag_supply_returns
set platform_refunded_at = coalesce(operation_time, document_time),
    platform_refunded_by = 1
where platform_refunded_at is null;

-- Clients may change ONLY the three native-mark columns (column-level grant),
-- and only with supplier_payments.manage — same permission as marking supplies.
grant update (platform_refunded_at, platform_refunded_by, platform_refund_account_id)
  on table public.umag_supply_returns to authenticated;

drop policy if exists umag_supply_returns_update_refund_mark on public.umag_supply_returns;
create policy umag_supply_returns_update_refund_mark
  on public.umag_supply_returns
  for update
  to authenticated
  using (auth_private.current_user_has_permission('supplier_payments.manage'))
  with check (auth_private.current_user_has_permission('supplier_payments.manage'));
