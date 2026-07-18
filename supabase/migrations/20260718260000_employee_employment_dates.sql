-- Employment dates for payroll period membership (hire / termination)

select pg_advisory_xact_lock(202607182600);

alter table public.academy_users
  add column if not exists hired_at date,
  add column if not exists terminated_at date;

comment on column public.academy_users.hired_at is
  'Дата приёма на работу (кадровая). По умолчанию = дата создания аккаунта; редактируется вручную.';

comment on column public.academy_users.terminated_at is
  'Дата увольнения. Заполняется автоматически при статусе terminated; очищается при восстановлении.';

-- Existing employees: hire date defaults to account creation day (Almaty calendar date)
update public.academy_users
set hired_at = (timezone('Asia/Almaty', created_at))::date
where hired_at is null
  and created_at is not null;

-- Legacy inactive/deactivated → terminated (UI model: Работает / Уволен)
update public.academy_users
set status = 'terminated'
where status in ('inactive', 'deactivated');

update public.academy_users
set terminated_at = coalesce(
  terminated_at,
  (timezone('Asia/Almaty', updated_at))::date,
  (timezone('Asia/Almaty', now()))::date
)
where status = 'terminated'
  and terminated_at is null;

create index if not exists idx_academy_users_hired_at
  on public.academy_users (hired_at);

create index if not exists idx_academy_users_terminated_at
  on public.academy_users (terminated_at)
  where terminated_at is not null;
