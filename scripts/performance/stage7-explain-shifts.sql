-- Stage 7 — EXPLAIN for Query C (shifts) across Home / Profile / Schedule shapes.
-- No full-archive scans: all variants keep date filters.

-- Home (home-summary): one day, order by employee_id
explain (format text)
select
  id, employee_id, shift_date, status,
  planned_start_time, planned_end_time, actual_start_time
from public.academy_employee_shifts
where shift_date = ((now() at time zone 'Asia/Almaty')::date)
order by employee_id asc;

-- Profile-like: one employee, ~month window
explain (format text)
select
  id, employee_id, shift_date, status,
  planned_start_time, planned_end_time, actual_start_time, actual_end_time, comment
from public.academy_employee_shifts
where shift_date >= ((now() at time zone 'Asia/Almaty')::date - 15)
  and shift_date <= ((now() at time zone 'Asia/Almaty')::date + 15)
  and employee_id = (
    select id
    from public.academy_users
    where status = 'active'
      and role <> 'admin'
    order by id
    limit 1
  )
order by shift_date asc, employee_id asc;

-- Schedule-like: team week
explain (format text)
select
  id, employee_id, shift_date, status,
  planned_start_time, planned_end_time, actual_start_time, actual_end_time, comment
from public.academy_employee_shifts
where shift_date >= (date_trunc('week', (now() at time zone 'Asia/Almaty')::timestamp)::date)
  and shift_date <= (date_trunc('week', (now() at time zone 'Asia/Almaty')::timestamp)::date + 6)
order by shift_date asc, employee_id asc;

-- Optional measured plans: wrap any of the above with
-- explain (analyze, buffers, format text) ...
