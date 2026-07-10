-- Тайм-трекер сохраняет только фактическое время и геолокацию.
-- Вычисляемые поля (late_minutes, attendance_status и т.д.) больше не обновляются RPC.
-- Статус смены вычисляется в приложении через computeShiftStatus().
-- Не выполнять автоматически — только через Supabase SQL Editor при необходимости.

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
  v_distance numeric;
  v_now timestamptz := now();
  v_today date := (v_now at time zone 'Asia/Almaty')::date;
  v_settings platform_attendance_settings;
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
    raise exception 'Вы находитесь вне рабочей территории (~% m)', round(v_distance);
  end if;

  select * into v_settings from platform_attendance_settings order by updated_at desc limit 1;

  v_early := greatest(0, floor(extract(epoch from (
    (v_today + v_shift.planned_end_time)::timestamptz - v_now
  )) / 60)::integer);

  update academy_employee_shifts
  set
    actual_end_time = v_now,
    check_out_latitude = p_latitude,
    check_out_longitude = p_longitude,
    check_out_accuracy = p_accuracy,
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
