-- Allow service_role (Edge Functions / dispatch core) to read employee shifts.

grant select on public.academy_employee_shifts to service_role;

notify pgrst, 'reload schema';
