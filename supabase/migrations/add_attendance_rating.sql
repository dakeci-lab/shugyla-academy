-- Тайм-трекер, рейтинг и рабочие точки

create table if not exists platform_work_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  latitude numeric not null,
  longitude numeric not null,
  radius_meters integer not null default 100 check (radius_meters between 20 and 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists platform_attendance_settings (
  id uuid primary key default gen_random_uuid(),
  on_time_points integer not null default 1,
  completed_shift_points integer not null default 1,
  late_penalty integer not null default -2,
  early_leave_penalty integer not null default -2,
  absence_penalty integer not null default -10,
  missing_check_in_penalty integer not null default -5,
  missing_check_out_penalty integer not null default -3,
  late_grace_minutes integer not null default 5,
  early_leave_grace_minutes integer not null default 5,
  checkout_wait_minutes integer not null default 120,
  updated_by bigint references academy_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists platform_employee_score_events (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references academy_users(id) on delete restrict,
  shift_id uuid references academy_employee_shifts(id) on delete set null,
  event_date date not null,
  event_type text not null check (event_type in (
    'on_time', 'completed_shift', 'late', 'early_leave', 'absence',
    'missing_check_in', 'missing_check_out', 'manual_bonus', 'manual_penalty'
  )),
  points integer not null,
  description text,
  is_manual boolean not null default false,
  created_by bigint references academy_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_score_events_auto_unique
  on platform_employee_score_events(employee_id, shift_id, event_type)
  where is_manual = false and shift_id is not null;

create index if not exists idx_score_events_employee_date
  on platform_employee_score_events(employee_id, event_date);

alter table academy_users
  add column if not exists work_location_id uuid references platform_work_locations(id) on delete set null;

alter table academy_employee_shifts
  add column if not exists check_in_latitude numeric,
  add column if not exists check_in_longitude numeric,
  add column if not exists check_in_accuracy numeric,
  add column if not exists check_out_latitude numeric,
  add column if not exists check_out_longitude numeric,
  add column if not exists check_out_accuracy numeric,
  add column if not exists late_minutes integer not null default 0,
  add column if not exists early_leave_minutes integer not null default 0,
  add column if not exists worked_minutes integer not null default 0,
  add column if not exists missing_check_in boolean not null default false,
  add column if not exists missing_check_out boolean not null default false,
  add column if not exists attendance_status text,
  add column if not exists work_location_id uuid references platform_work_locations(id) on delete set null;

insert into platform_attendance_settings (id)
select gen_random_uuid()
where not exists (select 1 from platform_attendance_settings limit 1);

-- Haversine distance in meters
create or replace function platform_haversine_meters(
  lat1 numeric,
  lng1 numeric,
  lat2 numeric,
  lng2 numeric
) returns numeric
language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians((lat2 - lat1) / 2)), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians((lng2 - lng1) / 2)), 2)
  ));
$$;

create or replace function platform_get_employee_work_location(p_employee_id bigint)
returns platform_work_locations
language plpgsql stable as $$
declare
  loc platform_work_locations;
begin
  select wl.* into loc
  from academy_users u
  join platform_work_locations wl on wl.id = u.work_location_id
  where u.id = p_employee_id and wl.is_active = true
  limit 1;

  if loc.id is not null then
    return loc;
  end if;

  select wl.* into loc
  from platform_work_locations wl
  where wl.is_active = true
  order by wl.created_at
  limit 1;

  return loc;
end;
$$;

create or replace function attendance_check_in(
  p_employee_id bigint,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy numeric default null
) returns academy_employee_shifts
language plpgsql as $$
declare
  v_shift academy_employee_shifts;
  v_loc platform_work_locations;
  v_settings platform_attendance_settings;
  v_distance numeric;
  v_now timestamptz := now();
  v_today date := (v_now at time zone 'Asia/Almaty')::date;
  v_late integer;
begin
  select * into v_shift
  from academy_employee_shifts
  where employee_id = p_employee_id and shift_date = v_today
  for update;

  if v_shift.id is null then
    raise exception 'На сегодня график не установлен';
  end if;

  if v_shift.status <> 'working' then
    raise exception 'Сегодня у вас нет запланированной рабочей смены';
  end if;

  if v_shift.actual_start_time is not null then
    raise exception 'Приход уже отмечен';
  end if;

  v_loc := platform_get_employee_work_location(p_employee_id);
  if v_loc.id is null then
    raise exception 'Рабочая территория ещё не настроена. Обратитесь к администратору';
  end if;

  v_distance := platform_haversine_meters(v_loc.latitude, v_loc.longitude, p_latitude, p_longitude);
  if v_distance > v_loc.radius_meters then
    raise exception 'Вы находитесь вне рабочей территории (~% м)', round(v_distance);
  end if;

  select * into v_settings from platform_attendance_settings order by updated_at desc limit 1;

  v_late := greatest(0, floor(extract(epoch from (
    v_now - (v_today + v_shift.planned_start_time)::timestamptz
  )) / 60)::integer);

  update academy_employee_shifts
  set
    actual_start_time = v_now,
    check_in_latitude = p_latitude,
    check_in_longitude = p_longitude,
    check_in_accuracy = p_accuracy,
    late_minutes = v_late,
    missing_check_in = false,
    attendance_status = 'in_progress',
    work_location_id = v_loc.id,
    updated_at = now()
  where id = v_shift.id
  returning * into v_shift;

  delete from platform_employee_score_events
  where employee_id = p_employee_id and shift_id = v_shift.id and is_manual = false;

  if v_late > coalesce(v_settings.late_grace_minutes, 5) then
    insert into platform_employee_score_events (
      employee_id, shift_id, event_date, event_type, points, description, is_manual, created_by
    ) values (
      p_employee_id, v_shift.id, v_today, 'late', coalesce(v_settings.late_penalty, -2),
      'Опоздание на ' || v_late || ' минут', false, p_employee_id
    ) on conflict do nothing;
  else
    insert into platform_employee_score_events (
      employee_id, shift_id, event_date, event_type, points, description, is_manual, created_by
    ) values (
      p_employee_id, v_shift.id, v_today, 'on_time', coalesce(v_settings.on_time_points, 1),
      'Своевременный приход', false, p_employee_id
    ) on conflict do nothing;
  end if;

  return v_shift;
end;
$$;

create or replace function attendance_check_out(
  p_employee_id bigint,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy numeric default null
) returns academy_employee_shifts
language plpgsql as $$
declare
  v_shift academy_employee_shifts;
  v_loc platform_work_locations;
  v_settings platform_attendance_settings;
  v_distance numeric;
  v_now timestamptz := now();
  v_today date := (v_now at time zone 'Asia/Almaty')::date;
  v_early integer;
  v_worked integer;
begin
  select * into v_shift
  from academy_employee_shifts
  where employee_id = p_employee_id and shift_date = v_today
  for update;

  if v_shift.id is null then
    raise exception 'На сегодня график не установлен';
  end if;

  if v_shift.actual_start_time is null then
    raise exception 'Сначала отметьте приход';
  end if;

  if v_shift.actual_end_time is not null then
    raise exception 'Уход уже отмечен';
  end if;

  v_loc := platform_get_employee_work_location(p_employee_id);
  if v_loc.id is null then
    raise exception 'Рабочая территория ещё не настроена. Обратитесь к администратору';
  end if;

  v_distance := platform_haversine_meters(v_loc.latitude, v_loc.longitude, p_latitude, p_longitude);
  if v_distance > v_loc.radius_meters then
    raise exception 'Вы находитесь вне рабочей территории (~% м)', round(v_distance);
  end if;

  select * into v_settings from platform_attendance_settings order by updated_at desc limit 1;

  v_early := greatest(0, floor(extract(epoch from (
    (v_today + v_shift.planned_end_time)::timestamptz - v_now
  )) / 60)::integer);

  v_worked := greatest(0, floor(extract(epoch from (v_now - v_shift.actual_start_time)) / 60)::integer);

  update academy_employee_shifts
  set
    actual_end_time = v_now,
    check_out_latitude = p_latitude,
    check_out_longitude = p_longitude,
    check_out_accuracy = p_accuracy,
    early_leave_minutes = v_early,
    worked_minutes = v_worked,
    missing_check_out = false,
    attendance_status = 'completed',
    updated_at = now()
  where id = v_shift.id
  returning * into v_shift;

  if v_early > coalesce(v_settings.early_leave_grace_minutes, 5) then
    insert into platform_employee_score_events (
      employee_id, shift_id, event_date, event_type, points, description, is_manual, created_by
    ) values (
      p_employee_id, v_shift.id, v_today, 'early_leave', coalesce(v_settings.early_leave_penalty, -2),
      'Ранний уход на ' || v_early || ' минут', false, p_employee_id
    ) on conflict do nothing;
  end if;

  insert into platform_employee_score_events (
    employee_id, shift_id, event_date, event_type, points, description, is_manual, created_by
  ) values (
    p_employee_id, v_shift.id, v_today, 'completed_shift', coalesce(v_settings.completed_shift_points, 1),
    'Полностью отработанная смена', false, p_employee_id
  ) on conflict do nothing;

  return v_shift;
end;
$$;

drop trigger if exists platform_work_locations_updated_at on platform_work_locations;
create trigger platform_work_locations_updated_at
  before update on platform_work_locations
  for each row execute function academy_set_updated_at();

alter table platform_work_locations enable row level security;
alter table platform_attendance_settings enable row level security;
alter table platform_employee_score_events enable row level security;

create policy "Allow anon read write platform_work_locations"
  on platform_work_locations for all using (true) with check (true);

create policy "Allow anon read write platform_attendance_settings"
  on platform_attendance_settings for all using (true) with check (true);

create policy "Allow anon read write platform_employee_score_events"
  on platform_employee_score_events for all using (true) with check (true);
