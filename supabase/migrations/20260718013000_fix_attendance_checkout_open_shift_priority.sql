-- Prefer any open unfinished attendance row for checkout (today or yesterday).
-- Prevents selecting today's empty/day_off row over yesterday's open overnight shift,
-- and allows checkout after planned end while actual_end_time is still null.

select pg_advisory_xact_lock(202607180130);

create or replace function public.attendance_check_out(
  p_employee_id bigint,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy numeric default null
) returns public.academy_employee_shifts
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_shift public.academy_employee_shifts;
  v_loc public.platform_work_locations;
  v_distance numeric;
  v_now timestamptz := now();
  v_today date := (v_now at time zone 'Asia/Almaty')::date;
begin
  if p_employee_id is null then
    raise exception 'Сотрудник не найден';
  end if;

  -- Only unfinished open attendance; oldest open first (overnight before same-day anomaly).
  select * into v_shift
  from public.academy_employee_shifts
  where employee_id = p_employee_id
    and actual_start_time is not null
    and actual_end_time is null
    and shift_date in (v_today, v_today - 1)
  order by shift_date asc
  limit 1
  for update;

  if v_shift.id is null then
    raise exception 'Активная смена не найдена. Обновите страницу или обратитесь к администратору';
  end if;

  v_loc := public.platform_get_employee_work_location(p_employee_id);
  if v_loc.id is null then
    raise exception 'Рабочая территория ещё не настроена. Обратитесь к администратору';
  end if;

  v_distance := public.platform_haversine_meters(
    v_loc.latitude,
    v_loc.longitude,
    p_latitude,
    p_longitude
  );
  if v_distance > v_loc.radius_meters then
    raise exception 'Вы находитесь вне рабочей территории (~% м)', round(v_distance);
  end if;

  update public.academy_employee_shifts
  set
    actual_end_time = v_now,
    check_out_latitude = p_latitude,
    check_out_longitude = p_longitude,
    check_out_accuracy = p_accuracy,
    updated_at = v_now
  where id = v_shift.id
    and employee_id = p_employee_id
    and actual_end_time is null
  returning * into v_shift;

  if v_shift.id is null then
    raise exception 'Активная смена не найдена. Обновите страницу или обратитесь к администратору';
  end if;

  return v_shift;
end;
$$;

comment on function public.attendance_check_out(bigint, numeric, numeric, numeric) is
  'Secure employee checkout via Edge Function service_role. Closes open attendance regardless of planned end.';

revoke all on function public.attendance_check_out(bigint, numeric, numeric, numeric) from public;
revoke all on function public.attendance_check_out(bigint, numeric, numeric, numeric) from anon;
revoke all on function public.attendance_check_out(bigint, numeric, numeric, numeric) from authenticated;
grant execute on function public.attendance_check_out(bigint, numeric, numeric, numeric) to service_role;

notify pgrst, 'reload schema';
