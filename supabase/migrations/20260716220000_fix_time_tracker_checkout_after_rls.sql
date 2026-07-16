-- Fix time tracker checkout after Phase 2 RLS cutover.
-- Root cause: clock_out used direct PostgREST UPDATE + geo RPC calls that may lack
-- service_role privileges after grants reconciliation, while clock_in uses
-- attendance_check_in() which performs geo + update inside one SQL function.
--
-- This migration:
--   1. Re-affirms service_role write access to academy_employee_shifts
--   2. Refreshes attendance_check_out with overnight-shift support
--   3. Restricts attendance RPC execute to service_role only (Edge Functions)

select pg_advisory_xact_lock(202607162200);

grant select, insert, update, delete on table public.academy_employee_shifts to service_role;

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

  select * into v_shift
  from public.academy_employee_shifts
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
  'Secure employee checkout via Edge Function service_role. Supports overnight open shifts.';

revoke all on function public.attendance_check_in(bigint, numeric, numeric, numeric) from public;
revoke all on function public.attendance_check_out(bigint, numeric, numeric, numeric) from public;
revoke all on function public.attendance_check_in(bigint, numeric, numeric, numeric) from anon;
revoke all on function public.attendance_check_out(bigint, numeric, numeric, numeric) from anon;
revoke all on function public.attendance_check_in(bigint, numeric, numeric, numeric) from authenticated;
revoke all on function public.attendance_check_out(bigint, numeric, numeric, numeric) from authenticated;

grant execute on function public.attendance_check_in(bigint, numeric, numeric, numeric) to service_role;
grant execute on function public.attendance_check_out(bigint, numeric, numeric, numeric) to service_role;

notify pgrst, 'reload schema';
