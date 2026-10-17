-- Stage 18 apply: drop academy_users columns used only by the removed schedule/payroll modules.
-- Run only after the frontend and Edge Functions without these columns are deployed.
-- No CASCADE: the CHECK constraints and the FK to platform_work_locations go with the columns; anything else aborts.
begin;
select pg_advisory_xact_lock(202610171801);
alter table public.academy_users drop column work_mode;
alter table public.academy_users drop column salary_calculation_type;
alter table public.academy_users drop column payroll_participation;
alter table public.academy_users drop column work_location_id;
commit;
