-- Salary / payroll MVP foundation (manual Excel-like calculation)
-- Extensible for time-tracker, rating, KPI later — no auto imports yet.

select pg_advisory_xact_lock(202607182500);

-- ---------------------------------------------------------------------------
-- Periods (one row per calendar month)
-- ---------------------------------------------------------------------------

create table if not exists public.salary_periods (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month integer not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salary_periods_year_check check (year >= 2000 and year <= 2100),
  constraint salary_periods_month_check check (month >= 1 and month <= 12),
  constraint salary_periods_status_check check (status in ('open', 'closed')),
  constraint salary_periods_year_month_unique unique (year, month)
);

comment on table public.salary_periods is
  'Payroll period (calendar month). Future: month close, finance export.';

drop trigger if exists salary_periods_updated_at on public.salary_periods;
create trigger salary_periods_updated_at
  before update on public.salary_periods
  for each row
  execute function public.academy_set_updated_at();

-- ---------------------------------------------------------------------------
-- Per-employee records within a period
-- ---------------------------------------------------------------------------

create table if not exists public.salary_records (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.salary_periods (id) on delete cascade,
  employee_id bigint not null references public.academy_users (id) on delete cascade,
  status text not null default 'draft',
  base_salary numeric(14, 2) not null default 0,
  work_hours numeric(10, 2) not null default 0,
  work_shifts numeric(10, 2) not null default 0,
  total_allowances numeric(14, 2) not null default 0,
  total_deductions numeric(14, 2) not null default 0,
  total_payable numeric(14, 2) not null default 0,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salary_records_status_check check (
    status in ('draft', 'review', 'confirmed', 'paid')
  ),
  constraint salary_records_base_non_negative check (base_salary >= 0),
  constraint salary_records_hours_non_negative check (work_hours >= 0),
  constraint salary_records_shifts_non_negative check (work_shifts >= 0),
  constraint salary_records_period_employee_unique unique (period_id, employee_id)
);

create index if not exists idx_salary_records_period_id
  on public.salary_records (period_id);

create index if not exists idx_salary_records_employee_id
  on public.salary_records (employee_id);

create index if not exists idx_salary_records_status
  on public.salary_records (status);

comment on table public.salary_records is
  'Employee payroll record for a month. work_* are manual in MVP; future: time-tracker.';

drop trigger if exists salary_records_updated_at on public.salary_records;
create trigger salary_records_updated_at
  before update on public.salary_records
  for each row
  execute function public.academy_set_updated_at();

-- ---------------------------------------------------------------------------
-- Allowances (начисления)
-- ---------------------------------------------------------------------------

create table if not exists public.salary_allowances (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.salary_records (id) on delete cascade,
  kind text not null default 'custom',
  title text not null,
  amount numeric(14, 2) not null default 0,
  comment text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salary_allowances_kind_check check (
    kind in ('premium', 'bonus', 'supplement', 'custom')
  ),
  constraint salary_allowances_title_not_empty check (char_length(trim(title)) > 0),
  constraint salary_allowances_amount_non_negative check (amount >= 0)
);

create index if not exists idx_salary_allowances_record_id
  on public.salary_allowances (record_id);

comment on table public.salary_allowances is
  'Payroll allowances / начисления. Future: rating/KPI-driven rows.';

drop trigger if exists salary_allowances_updated_at on public.salary_allowances;
create trigger salary_allowances_updated_at
  before update on public.salary_allowances
  for each row
  execute function public.academy_set_updated_at();

-- ---------------------------------------------------------------------------
-- Deductions (удержания)
-- ---------------------------------------------------------------------------

create table if not exists public.salary_deductions (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.salary_records (id) on delete cascade,
  kind text not null default 'custom',
  title text not null,
  amount numeric(14, 2) not null default 0,
  comment text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salary_deductions_kind_check check (
    kind in ('fine', 'advance', 'deduction', 'custom')
  ),
  constraint salary_deductions_title_not_empty check (char_length(trim(title)) > 0),
  constraint salary_deductions_amount_non_negative check (amount >= 0)
);

create index if not exists idx_salary_deductions_record_id
  on public.salary_deductions (record_id);

comment on table public.salary_deductions is
  'Payroll deductions / удержания. Future: penalty points, advances from finance.';

drop trigger if exists salary_deductions_updated_at on public.salary_deductions;
create trigger salary_deductions_updated_at
  before update on public.salary_deductions
  for each row
  execute function public.academy_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: admin / payroll.view + payroll.calculate
-- ---------------------------------------------------------------------------

alter table public.salary_periods enable row level security;
alter table public.salary_records enable row level security;
alter table public.salary_allowances enable row level security;
alter table public.salary_deductions enable row level security;

revoke all on table public.salary_periods from public, anon, authenticated;
revoke all on table public.salary_records from public, anon, authenticated;
revoke all on table public.salary_allowances from public, anon, authenticated;
revoke all on table public.salary_deductions from public, anon, authenticated;

grant select, insert, update on table public.salary_periods to authenticated;
grant select, insert, update, delete on table public.salary_records to authenticated;
grant select, insert, update, delete on table public.salary_allowances to authenticated;
grant select, insert, update, delete on table public.salary_deductions to authenticated;

grant all on table public.salary_periods to service_role;
grant all on table public.salary_records to service_role;
grant all on table public.salary_allowances to service_role;
grant all on table public.salary_deductions to service_role;

-- Periods
drop policy if exists salary_periods_select_payroll on public.salary_periods;
create policy salary_periods_select_payroll
  on public.salary_periods for select to authenticated
  using (
    auth_private.current_user_has_permission('payroll.view')
    or auth_private.current_user_has_permission('payroll.calculate')
  );

drop policy if exists salary_periods_write_payroll on public.salary_periods;
create policy salary_periods_write_payroll
  on public.salary_periods for insert to authenticated
  with check (auth_private.current_user_has_permission('payroll.calculate'));

drop policy if exists salary_periods_update_payroll on public.salary_periods;
create policy salary_periods_update_payroll
  on public.salary_periods for update to authenticated
  using (auth_private.current_user_has_permission('payroll.calculate'))
  with check (auth_private.current_user_has_permission('payroll.calculate'));

-- Records
drop policy if exists salary_records_select_payroll on public.salary_records;
create policy salary_records_select_payroll
  on public.salary_records for select to authenticated
  using (
    auth_private.current_user_has_permission('payroll.view')
    or auth_private.current_user_has_permission('payroll.calculate')
  );

drop policy if exists salary_records_insert_payroll on public.salary_records;
create policy salary_records_insert_payroll
  on public.salary_records for insert to authenticated
  with check (auth_private.current_user_has_permission('payroll.calculate'));

drop policy if exists salary_records_update_payroll on public.salary_records;
create policy salary_records_update_payroll
  on public.salary_records for update to authenticated
  using (auth_private.current_user_has_permission('payroll.calculate'))
  with check (auth_private.current_user_has_permission('payroll.calculate'));

drop policy if exists salary_records_delete_payroll on public.salary_records;
create policy salary_records_delete_payroll
  on public.salary_records for delete to authenticated
  using (auth_private.current_user_has_permission('payroll.calculate'));

-- Allowances
drop policy if exists salary_allowances_select_payroll on public.salary_allowances;
create policy salary_allowances_select_payroll
  on public.salary_allowances for select to authenticated
  using (
    auth_private.current_user_has_permission('payroll.view')
    or auth_private.current_user_has_permission('payroll.calculate')
  );

drop policy if exists salary_allowances_insert_payroll on public.salary_allowances;
create policy salary_allowances_insert_payroll
  on public.salary_allowances for insert to authenticated
  with check (auth_private.current_user_has_permission('payroll.calculate'));

drop policy if exists salary_allowances_update_payroll on public.salary_allowances;
create policy salary_allowances_update_payroll
  on public.salary_allowances for update to authenticated
  using (auth_private.current_user_has_permission('payroll.calculate'))
  with check (auth_private.current_user_has_permission('payroll.calculate'));

drop policy if exists salary_allowances_delete_payroll on public.salary_allowances;
create policy salary_allowances_delete_payroll
  on public.salary_allowances for delete to authenticated
  using (auth_private.current_user_has_permission('payroll.calculate'));

-- Deductions
drop policy if exists salary_deductions_select_payroll on public.salary_deductions;
create policy salary_deductions_select_payroll
  on public.salary_deductions for select to authenticated
  using (
    auth_private.current_user_has_permission('payroll.view')
    or auth_private.current_user_has_permission('payroll.calculate')
  );

drop policy if exists salary_deductions_insert_payroll on public.salary_deductions;
create policy salary_deductions_insert_payroll
  on public.salary_deductions for insert to authenticated
  with check (auth_private.current_user_has_permission('payroll.calculate'));

drop policy if exists salary_deductions_update_payroll on public.salary_deductions;
create policy salary_deductions_update_payroll
  on public.salary_deductions for update to authenticated
  using (auth_private.current_user_has_permission('payroll.calculate'))
  with check (auth_private.current_user_has_permission('payroll.calculate'));

drop policy if exists salary_deductions_delete_payroll on public.salary_deductions;
create policy salary_deductions_delete_payroll
  on public.salary_deductions for delete to authenticated
  using (auth_private.current_user_has_permission('payroll.calculate'));
