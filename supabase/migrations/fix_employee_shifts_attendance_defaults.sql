-- Исправление DEFAULT для полей attendance в academy_employee_shifts
-- Безопасно: не удаляет данные, только нормализует NULL (если есть) и подтверждает DEFAULT.

-- На случай, если колонки были добавлены без NOT NULL / DEFAULT
update academy_employee_shifts
set late_minutes = 0
where late_minutes is null;

update academy_employee_shifts
set early_leave_minutes = 0
where early_leave_minutes is null;

update academy_employee_shifts
set worked_minutes = 0
where worked_minutes is null;

update academy_employee_shifts
set missing_check_in = false
where missing_check_in is null;

update academy_employee_shifts
set missing_check_out = false
where missing_check_out is null;

update academy_employee_shifts
set attendance_status = 'scheduled'
where attendance_status is null;

alter table academy_employee_shifts
  alter column late_minutes set default 0,
  alter column early_leave_minutes set default 0,
  alter column worked_minutes set default 0,
  alter column missing_check_in set default false,
  alter column missing_check_out set default false;

alter table academy_employee_shifts
  alter column late_minutes set not null,
  alter column early_leave_minutes set not null,
  alter column worked_minutes set not null,
  alter column missing_check_in set not null,
  alter column missing_check_out set not null;

-- attendance_status остаётся nullable (in_progress, completed и т.д.)
