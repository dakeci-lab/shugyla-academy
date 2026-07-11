-- Тайм-трекер: checkout после полночи для смен через midnight (12:45–00:00).
-- Рейтинг вычисляется в приложении — platform_employee_score_events не используется.
-- Применять в Supabase SQL Editor при необходимости.

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
  v_distance numeric;
  v_now timestamptz := now();
  v_today date := (v_now at time zone 'Asia/Almaty')::date;
begin
  select * into v_shift
  from academy_employee_shifts
  where employee_id = p_employee_id
    and (
      shift_date = v_today
      or (
        shift_date = v_today - 1
        and actual_start_time is not null
        and actual_end_time is null
      )
    )
  order by shift_date desc
  limit 1
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

  update academy_employee_shifts
  set
    actual_end_time = v_now,
    check_out_latitude = p_latitude,
    check_out_longitude = p_longitude,
    check_out_accuracy = p_accuracy,
    updated_at = now()
  where id = v_shift.id
  returning * into v_shift;

  return v_shift;
end;
$$;
