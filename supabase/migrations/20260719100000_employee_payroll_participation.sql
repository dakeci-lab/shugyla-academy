-- Payroll participation: active in ledger vs excluded (test / non-payroll staff)

select pg_advisory_xact_lock(202607191000);

alter table public.academy_users
  add column if not exists payroll_participation text;

update public.academy_users
set payroll_participation = 'active'
where payroll_participation is null;

alter table public.academy_users
  alter column payroll_participation set default 'active',
  alter column payroll_participation set not null;

alter table public.academy_users
  drop constraint if exists academy_users_payroll_participation_check;

alter table public.academy_users
  add constraint academy_users_payroll_participation_check
  check (payroll_participation in ('active', 'excluded'));

comment on column public.academy_users.payroll_participation is
  'Участие в зарплатной ведомости: active | excluded. Независимо от статуса сотрудника и типа расчёта.';
