-- Stage 13d preflight (READ-ONLY). Every block must return ZERO rows except the "exists" block
-- (all 20 rows must say true) before apply_13d_drop_personnel.sql is run.

-- A. every table to drop exists (expect 20 rows, v = true)
with drop_set(t) as (values
 ('academy_employee_shifts'),('salary_records'),('salary_periods'),('salary_deductions'),('salary_allowances'),
 ('academy_candidates'),('academy_candidate_questions'),('academy_vacancies'),('academy_people'),('recruitment_application_uploads'),
 ('employee_documents'),('notifications'),('notification_deliveries'),('notification_push_subscriptions'),('notification_preferences'),
 ('notification_rules'),('notification_templates'),('notification_test_send_permits'),('notification_test_broadcast_audits'),('platform_attendance_settings'))
select d.t, (to_regclass('public.'||d.t) is not null) v from drop_set d order by 1;

-- B. foreign keys from a KEPT table into the drop set (expect 0 rows)
with drop_set(t) as (values
 ('academy_employee_shifts'),('salary_records'),('salary_periods'),('salary_deductions'),('salary_allowances'),
 ('academy_candidates'),('academy_candidate_questions'),('academy_vacancies'),('academy_people'),('recruitment_application_uploads'),
 ('employee_documents'),('notifications'),('notification_deliveries'),('notification_push_subscriptions'),('notification_preferences'),
 ('notification_rules'),('notification_templates'),('notification_test_send_permits'),('notification_test_broadcast_audits'),('platform_attendance_settings'))
select c.conrelid::regclass::text child, c.confrelid::regclass::text parent
from pg_constraint c
where c.contype = 'f'
  and c.confrelid in (select to_regclass('public.'||t) from drop_set)
  and c.conrelid not in (select to_regclass('public.'||t) from drop_set);

-- C. views / materialized views over the drop set (expect 0 rows)
with drop_set(t) as (values
 ('academy_employee_shifts'),('salary_records'),('salary_periods'),('salary_deductions'),('salary_allowances'),
 ('academy_candidates'),('academy_candidate_questions'),('academy_vacancies'),('academy_people'),('recruitment_application_uploads'),
 ('employee_documents'),('notifications'),('notification_deliveries'),('notification_push_subscriptions'),('notification_preferences'),
 ('notification_rules'),('notification_templates'),('notification_test_send_permits'),('notification_test_broadcast_audits'),('platform_attendance_settings'))
select distinct v.relname view_name
from pg_depend dep
join pg_rewrite r on r.oid = dep.objid
join pg_class v on v.oid = r.ev_class
where dep.refobjid in (select to_regclass('public.'||t) from drop_set)
  and v.relkind in ('v','m') and v.relnamespace = 'public'::regnamespace;

-- D. RLS policies on KEPT tables that mention a dropped table (expect 0 rows)
with drop_set(t) as (values
 ('academy_employee_shifts'),('salary_records'),('salary_periods'),('salary_deductions'),('salary_allowances'),
 ('academy_candidates'),('academy_candidate_questions'),('academy_vacancies'),('academy_people'),('recruitment_application_uploads'),
 ('employee_documents'),('notifications'),('notification_deliveries'),('notification_push_subscriptions'),('notification_preferences'),
 ('notification_rules'),('notification_templates'),('notification_test_send_permits'),('notification_test_broadcast_audits'),('platform_attendance_settings'))
select pol.tablename, pol.policyname
from pg_policies pol
where pol.schemaname = 'public'
  and pol.tablename not in (select t from drop_set)
  and exists (select 1 from drop_set d
              where coalesce(pol.qual,'')||' '||coalesce(pol.with_check,'') ~ ('\m'||d.t||'\M'));

-- E. KEPT functions that mention a dropped table (expect only the functions listed in apply_13d)
with drop_set(t) as (values
 ('academy_employee_shifts'),('salary_records'),('salary_periods'),('salary_deductions'),('salary_allowances'),
 ('academy_candidates'),('academy_candidate_questions'),('academy_vacancies'),('academy_people'),('recruitment_application_uploads'),
 ('employee_documents'),('notifications'),('notification_deliveries'),('notification_push_subscriptions'),('notification_preferences'),
 ('notification_rules'),('notification_templates'),('notification_test_send_permits'),('notification_test_broadcast_audits'),('platform_attendance_settings'))
select p.proname, pg_get_function_identity_arguments(p.oid) args
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p')
  and exists (select 1 from drop_set d where p.prosrc ~ ('\m'||d.t||'\M'))
order by 1;

-- F. cron jobs (expect: time-tracker job present; procurement jobs stay active)
select jobid, jobname, active from cron.job order by jobid;
