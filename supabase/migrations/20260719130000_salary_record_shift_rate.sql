-- Per-shift rate on payroll records (shift_based employees). Monthly base stays in base_salary.

select pg_advisory_xact_lock(202607191300);

alter table public.salary_records
  add column if not exists shift_rate numeric(14, 2);

update public.salary_records
set shift_rate = 0
where shift_rate is null;

alter table public.salary_records
  alter column shift_rate set default 0,
  alter column shift_rate set not null;

alter table public.salary_records
  drop constraint if exists salary_records_shift_rate_non_negative;

alter table public.salary_records
  add constraint salary_records_shift_rate_non_negative
  check (shift_rate >= 0);

comment on column public.salary_records.shift_rate is
  'Стоимость одной смены для сотрудников с типом расчёта shift_based. Будущее: base_salary = shift_rate × work_shifts.';
