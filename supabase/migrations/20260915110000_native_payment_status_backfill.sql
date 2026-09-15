-- Full decoupling from UMAG's payment status: the owner is instructing staff
-- to mark every UMAG supply document paid immediately at receiving time
-- (regardless of real payment status — cash or consignment), specifically so
-- UMAG's own debt tracking stops being trusted for anything. Real payment
-- status is now tracked exclusively in Shugyla via platform_paid_at
-- (20260915090000_native_supplier_payment_marking.sql).
--
-- Consequence handled here: obligations were previously only ever CREATED
-- when a UMAG supply carried debt > 0 (see the paired umag-sync/index.ts
-- change removing that skip). Under the new policy debt reads 0 pretty much
-- immediately for everything, so without this backfill "К оплате" would
-- silently never show ~thousands of already-received documents at all —
-- not as paid, not as unpaid, just absent. This migration:
--   1) auto-marks existing obligation rows that already show debt <= 0 today
--      (genuinely already resolved before this policy existed) as paid, so
--      the owner isn't asked to re-confirm thousands of old deliveries by hand;
--   2) backfills a missing obligation row for every non-deleted umag_supplies
--      document that never got one (exactly the ones previously skipped for
--      having debt <= 0 at first sync), also auto-marked paid for the same
--      reason.
-- Only NEW deliveries from here on require an explicit "Оплачено" click.

select pg_advisory_xact_lock(202609151100);

-- 1) Auto-mark already-resolved existing obligations.
update public.supplier_payment_obligations
set platform_paid_at = now()
where platform_paid_at is null
  and is_source_deleted = false
  and current_debt <= 0;

-- 2) Backfill obligation rows missing entirely (previously skipped at debt <= 0).
insert into public.supplier_payment_obligations (
  platform_supplier_id,
  umag_supply_id,
  umag_supply_row_id,
  supply_document_date,
  source_doc_time,
  original_supply_amount,
  current_payment_amount,
  current_debt,
  is_source_deleted,
  first_seen_at,
  last_synced_at,
  platform_paid_at
)
select
  s.platform_supplier_id,
  s.umag_supply_id,
  s.id,
  (s.doc_time at time zone 'Asia/Aqtobe')::date,
  s.doc_time,
  coalesce(s.amount, 0),
  coalesce(s.payment_amount, 0),
  coalesce(s.debt, 0),
  false,
  coalesce(s.created_at, now()),
  now(),
  now()
from public.umag_supplies s
where s.is_source_deleted = false
  and not exists (
    select 1 from public.supplier_payment_obligations o
    where o.umag_supply_id = s.umag_supply_id
  )
on conflict (umag_supply_id) do nothing;

comment on table public.supplier_payment_obligations is
  'Payment schedule — one row per UMAG supply document. Paid/unpaid is decided purely by platform_paid_at (native, see 20260915090000); current_debt is a UMAG mirror kept for reference only, not authoritative — staff zero it out in UMAG immediately at receiving time by policy.';
