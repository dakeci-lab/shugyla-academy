-- PR 2: connect platform_suppliers / supplier_payment_obligations to
-- payment_accounts (added standalone in 20260914120000_payment_accounts.sql).
-- Retires the old cash/transfer/deferral/mixed payment_type enum — the owner
-- wants payment method to be a free-form, user-managed list, and the term
-- (deferral_days) is now fully independent of it (see docs/suppliers/
-- payment-accounts-module.md and docs/suppliers/single-payment-terms-field.md
-- for the history this replaces).

select pg_advisory_xact_lock(202609141300);

-- ---------------------------------------------------------------------------
-- platform_suppliers: payment_type (text enum) -> payment_account_id (FK)
-- ---------------------------------------------------------------------------

alter table public.platform_suppliers
  add column if not exists payment_account_id uuid references public.payment_accounts(id);

-- Backfill: cash -> Наличные, anything else (transfer/deferral/mixed/unknown)
-- -> Перевод. (Earlier audit against a smaller seed data set suggested this
-- was 100% cash; production has since grown and genuinely has transfer/
-- deferral suppliers too — the mapping still holds, it's just not vacuous.)
update public.platform_suppliers ps
set payment_account_id = pa.id
from public.payment_accounts pa
where ps.payment_account_id is null
  and pa.name = (case when ps.payment_type = 'cash' then 'Наличные' else 'Перевод' end);

-- cash/transfer previously ALWAYS resolved to 0 days for due-date purposes
-- regardless of what this column held (isImmediatePaymentType short-circuit
-- in the old resolveSupplierPaymentTerms) — so a supplier with deferral_days
-- left NULL was still treated as fully configured, due immediately. Now that
-- deferral_days is read directly with no type override, a NULL here would
-- newly and incorrectly show as "Требует настройки" for that supplier's next
-- delivery. Backfill preserves the old effective behavior; deferral/mixed
-- suppliers with NULL days are untouched — they were already unconfigured
-- before this migration, that's their genuine state.
update public.platform_suppliers
set deferral_days = 0
where deferral_days is null
  and payment_type in ('cash', 'transfer');

alter table public.platform_suppliers drop column if exists payment_type;

create index if not exists idx_platform_suppliers_payment_account_id
  on public.platform_suppliers (payment_account_id);

comment on column public.platform_suppliers.payment_account_id is
  'FK to payment_accounts — способ оплаты (Наличные/Перевод/...). Independent of deferral_days (срок): either axis can be set without the other.';

-- ---------------------------------------------------------------------------
-- supplier_payment_obligations: payment_terms_type_snapshot (text) ->
-- payment_account_id_snapshot (FK). deferment_days_snapshot / due_date
-- untouched — the day-based due-date math never depended on payment method.
-- ---------------------------------------------------------------------------

alter table public.supplier_payment_obligations
  add column if not exists payment_account_id_snapshot uuid references public.payment_accounts(id);

update public.supplier_payment_obligations spo
set payment_account_id_snapshot = pa.id
from public.payment_accounts pa
where spo.payment_account_id_snapshot is null
  and spo.payment_terms_type_snapshot is not null
  and pa.name = (case when spo.payment_terms_type_snapshot = 'cash' then 'Наличные' else 'Перевод' end);

alter table public.supplier_payment_obligations drop column if exists payment_terms_type_snapshot;

comment on column public.supplier_payment_obligations.payment_account_id_snapshot is
  'Snapshot of platform_suppliers.payment_account_id at the time the obligation''s terms were last (re)computed. Refreshed for still-open obligations when the supplier''s account changes — same rule as deferment_days_snapshot, see docs/suppliers/retroactive-payment-terms.md.';
