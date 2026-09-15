-- Native "Оплачено" marking in Shugyla, independent of UMAG's own debt sync.
--
-- Context: staff paid a supplier (bank transfer/cash), then separately opened
-- UMAG and clicked "Оплатить" there purely so UMAG's own debt view stayed
-- accurate for consignment-deadline tracking — not for tax/accounting (that
-- lives in manual "Журнал Сейф"/"ОДДС" spreadsheets, out of scope here).
-- That UMAG round trip + the "Синхронизировать" click needed afterwards to
-- see it reflected in Shugyla cost 2-3 minutes per supplier, ×20-30/day.
--
-- This lets "Оплачено" be a single instant write in our own DB — no UMAG
-- round trip, no sync needed to see it. UMAG's `current_debt` mirror keeps
-- syncing on its own schedule for whenever the accountant catches up there;
-- neither side can silently undo the other (see resolveObligationTermsPatch-
-- adjacent status logic in src/utils/supplierPaymentObligations.js).

select pg_advisory_xact_lock(202609150900);

alter table public.supplier_payment_obligations
  add column if not exists platform_paid_at timestamptz null,
  add column if not exists platform_paid_by bigint null references public.academy_users(id) on delete set null,
  add column if not exists platform_payment_account_id uuid null references public.payment_accounts(id);

create index if not exists idx_spo_platform_paid_at
  on public.supplier_payment_obligations (platform_paid_at)
  where platform_paid_at is not null;

comment on column public.supplier_payment_obligations.platform_paid_at is
  'Set when marked paid natively in Shugyla (independent of UMAG''s debt sync). Once set, the obligation shows as paid regardless of what current_debt says — a later UMAG sync never clears it. Cleared only by explicitly un-marking.';
comment on column public.supplier_payment_obligations.platform_paid_by is
  'academy_users.id of whoever clicked Оплачено/Отменить оплату last.';
comment on column public.supplier_payment_obligations.platform_payment_account_id is
  'Snapshot of the supplier''s payment_account_id at the moment it was marked paid — defaults from the supplier''s current account, not re-prompted (v1: full payment only, one click).';

-- Existing supplier_payment_obligations_update_terms policy already allows
-- authenticated with supplier_payments.manage/suppliers.edit to update any
-- column on open rows (row-level, not column-level) — no new RLS needed.
