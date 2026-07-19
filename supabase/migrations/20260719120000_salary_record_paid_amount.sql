-- Actual salary payout amount on the payroll ledger (partial payments supported)

select pg_advisory_xact_lock(202607191200);

alter table public.salary_records
  add column if not exists paid_amount numeric(14, 2);

update public.salary_records
set paid_amount = case
  when status = 'paid' then total_payable
  else 0
end
where paid_amount is null;

alter table public.salary_records
  alter column paid_amount set default 0,
  alter column paid_amount set not null;

alter table public.salary_records
  drop constraint if exists salary_records_paid_non_negative;

alter table public.salary_records
  add constraint salary_records_paid_non_negative
  check (paid_amount >= 0);

comment on column public.salary_records.paid_amount is
  'Фактически выплаченная сумма (итого). Остаток = total_payable − paid_amount.';
