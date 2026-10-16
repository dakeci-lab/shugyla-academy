-- Stage 13e: remove the permissions of deleted modules (schedule, attendance, recruitment, payroll,
-- notifications.manage) from the DB. The frontend catalog stopped listing them in the previous deploy.
-- Applied on prod 2026-10-16 via MCP (recorded by Supabase under its own timestamp).
-- No RLS policy or function referenced these codes (checked before applying).
-- No data rollback: re-insert the rows from git history of supabase/schema.sql / seed migrations if ever needed.

select pg_advisory_xact_lock(202610170003);

delete from public.role_permissions rp
using public.permissions p
where p.id = rp.permission_id
  and p.code in ('schedule.view_team','schedule.view_own','schedule.edit','schedule.bulk_edit',
                 'attendance.view','attendance.check_in','attendance.check_out',
                 'recruitment.view','recruitment.manage_vacancies','recruitment.manage_candidates',
                 'recruitment.invite_candidate','recruitment.hire_candidate',
                 'payroll.view','payroll.calculate','payroll.manage_settings','notifications.manage');

delete from public.permissions
where code in ('schedule.view_team','schedule.view_own','schedule.edit','schedule.bulk_edit',
               'attendance.view','attendance.check_in','attendance.check_out',
               'recruitment.view','recruitment.manage_vacancies','recruitment.manage_candidates',
               'recruitment.invite_candidate','recruitment.hire_candidate',
               'payroll.view','payroll.calculate','payroll.manage_settings','notifications.manage');
