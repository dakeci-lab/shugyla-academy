-- Repair missing supplier_payment_obligations for open UMAG debts.
-- Idempotent: only inserts rows that do not already exist.
-- Root cause of partial calendar was Edge upsert heterogeneity (fixed in umag-sync),
-- not a schema defect. This migration heals environments that drifted.

select pg_advisory_xact_lock(202607280500);

insert into public.supplier_payment_obligations (
  platform_supplier_id,
  umag_supply_id,
  umag_supply_row_id,
  supply_document_date,
  source_doc_time,
  original_supply_amount,
  current_payment_amount,
  current_debt,
  payment_terms_type_snapshot,
  deferment_days_snapshot,
  due_date,
  terms_snapshot_created_at,
  is_source_deleted,
  first_seen_at,
  last_synced_at,
  paid_at
)
select
  case
    when p.is_merged and p.merged_into_supplier_id is not null then p.merged_into_supplier_id
    else s.platform_supplier_id
  end as platform_supplier_id,
  s.umag_supply_id,
  s.id,
  (s.doc_time at time zone 'Asia/Aqtobe')::date,
  s.doc_time,
  coalesce(s.amount, 0),
  coalesce(s.payment_amount, 0),
  coalesce(s.debt, 0),
  case
    when coalesce(sp.payment_type, p.payment_type) in ('cash', 'transfer', 'deferral', 'mixed')
      then coalesce(sp.payment_type, p.payment_type)
    else null
  end as payment_terms_type_snapshot,
  case
    when coalesce(sp.payment_type, p.payment_type) in ('cash', 'transfer') then 0
    when coalesce(sp.payment_type, p.payment_type) in ('deferral', 'mixed')
      and coalesce(sp.deferral_days, p.deferral_days) is not null
      and coalesce(sp.deferral_days, p.deferral_days) >= 0
      and coalesce(sp.deferral_days, p.deferral_days) <= 365
      then coalesce(sp.deferral_days, p.deferral_days)
    else null
  end as deferment_days_snapshot,
  case
    when coalesce(sp.payment_type, p.payment_type) in ('cash', 'transfer')
      then (s.doc_time at time zone 'Asia/Aqtobe')::date
    when coalesce(sp.payment_type, p.payment_type) in ('deferral', 'mixed')
      and coalesce(sp.deferral_days, p.deferral_days) is not null
      and coalesce(sp.deferral_days, p.deferral_days) >= 0
      and coalesce(sp.deferral_days, p.deferral_days) <= 365
      then (s.doc_time at time zone 'Asia/Aqtobe')::date
        + coalesce(sp.deferral_days, p.deferral_days)
    else null
  end as due_date,
  case
    when coalesce(sp.payment_type, p.payment_type) in ('cash', 'transfer') then now()
    when coalesce(sp.payment_type, p.payment_type) in ('deferral', 'mixed')
      and coalesce(sp.deferral_days, p.deferral_days) is not null
      and coalesce(sp.deferral_days, p.deferral_days) >= 0
      and coalesce(sp.deferral_days, p.deferral_days) <= 365
      then now()
    else null
  end as terms_snapshot_created_at,
  false,
  now(),
  now(),
  null
from public.umag_supplies s
left join public.platform_suppliers p on p.id = s.platform_supplier_id
left join public.platform_suppliers sp
  on sp.id = case
    when p.is_merged and p.merged_into_supplier_id is not null then p.merged_into_supplier_id
    else s.platform_supplier_id
  end
where coalesce(s.is_source_deleted, false) = false
  and coalesce(s.debt, 0) > 0
on conflict (umag_supply_id) do nothing;
