-- Employee work mode + salary calculation type (foundation for payroll / schedule rules)

select pg_advisory_xact_lock(202607182700);

alter table public.academy_users
  add column if not exists work_mode text,
  add column if not exists salary_calculation_type text;

update public.academy_users
set work_mode = 'offline'
where work_mode is null;

update public.academy_users
set salary_calculation_type = 'shift_based'
where salary_calculation_type is null;

alter table public.academy_users
  alter column work_mode set default 'offline',
  alter column work_mode set not null,
  alter column salary_calculation_type set default 'shift_based',
  alter column salary_calculation_type set not null;

alter table public.academy_users
  drop constraint if exists academy_users_work_mode_check;

alter table public.academy_users
  add constraint academy_users_work_mode_check
  check (work_mode in ('offline', 'online'));

alter table public.academy_users
  drop constraint if exists academy_users_salary_calculation_type_check;

alter table public.academy_users
  add constraint academy_users_salary_calculation_type_check
  check (salary_calculation_type in ('shift_based', 'fixed_salary'));

comment on column public.academy_users.work_mode is
  'Режим работы: offline (магазин) | online (удалённо). Пока только хранение/отображение.';

comment on column public.academy_users.salary_calculation_type is
  'Тип расчёта зарплаты: shift_based (по сменам) | fixed_salary (фиксированный оклад).';
