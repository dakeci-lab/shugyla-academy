-- График смен сотрудников (подготовка к тайм-трекеру)
-- employee_id — bigint, как в academy_users

create table if not exists academy_employee_shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references academy_users(id) on delete restrict,
  shift_date date not null,
  status text not null default 'working'
    check (status in ('working', 'day_off', 'vacation', 'sick_leave', 'absence')),
  planned_start_time time,
  planned_end_time time,
  planned_break_start time,
  planned_break_end time,
  actual_start_time timestamptz,
  actual_end_time timestamptz,
  actual_break_start timestamptz,
  actual_break_end timestamptz,
  comment text,
  created_by bigint references academy_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, shift_date)
);

create index if not exists idx_employee_shifts_employee_date
  on academy_employee_shifts(employee_id, shift_date);

create index if not exists idx_employee_shifts_date
  on academy_employee_shifts(shift_date);

drop trigger if exists academy_employee_shifts_updated_at on academy_employee_shifts;
create trigger academy_employee_shifts_updated_at
  before update on academy_employee_shifts
  for each row execute function academy_set_updated_at();

alter table academy_employee_shifts enable row level security;

create policy "Allow anon read write academy_employee_shifts"
  on academy_employee_shifts for all using (true) with check (true);
