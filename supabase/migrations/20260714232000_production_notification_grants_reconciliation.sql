-- Production notification dispatch grants reconciliation
-- Applies 20260714130000 + 20260714160000 service_role grants only.

select pg_advisory_xact_lock(202607142320);

grant select on table public.roles to service_role;
grant select on table public.permissions to service_role;
grant select on table public.role_permissions to service_role;

grant select on table public.academy_employee_shifts to service_role;

notify pgrst, 'reload schema';
