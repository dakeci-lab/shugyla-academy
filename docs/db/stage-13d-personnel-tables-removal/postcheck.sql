-- Stage 13d postcheck (READ-ONLY). Expect: block 1 and 2 return 0 rows; block 3 counts unchanged
-- from README; block 4 shows the two procurement cron jobs active and no time-tracker job.

-- 1. dropped tables are gone (expect 0 rows)
select relname from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r' and relname in (
 'academy_employee_shifts','salary_records','salary_periods','salary_deductions','salary_allowances',
 'academy_candidates','academy_candidate_questions','academy_vacancies','academy_people','recruitment_application_uploads',
 'employee_documents','notifications','notification_deliveries','notification_push_subscriptions','notification_preferences',
 'notification_rules','notification_templates','notification_test_send_permits','notification_test_broadcast_audits','platform_attendance_settings');

-- 2. dropped functions are gone (expect 0 rows)
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in (
 'academy_candidates_maintain_current','academy_vacancies_seed_form_on_insert','academy_vacancies_sync_position_snapshot',
 'academy_vacancies_validate_publish','notification_deliveries_require_push_subscription','application_form_limits',
 'application_form_normalize_options','application_form_question_used','attendance_check_in','attendance_check_out',
 'cancel_candidate_photo_upload_session','candidate_status_progress_rank','consume_notification_test_send_permit',
 'create_candidate_photo_upload_session','duplicate_vacancy_with_application_form','get_public_vacancy_application_form',
 'invoke_time_tracker_notification_scheduler','issue_notification_test_send_permit','list_expired_unused_application_uploads',
 'list_published_vacancies_for_apply','mark_notification_read','recruitment_advisory_key','save_vacancy_application_form',
 'seed_vacancy_application_form','submit_candidate_application','validate_vacancy_application_form');

-- 3. kept data untouched (compare with the counts in README.md)
select 'academy_users' t, count(*) from academy_users
union all select 'platform_suppliers', count(*) from platform_suppliers
union all select 'purchase_orders', count(*) from purchase_orders
union all select 'supplier_payment_obligations', count(*) from supplier_payment_obligations
union all select 'roles', count(*) from roles
union all select 'role_permissions', count(*) from role_permissions;

-- 4. cron: procurement jobs still active, no time-tracker job
select jobid, jobname, active from cron.job order by jobid;

-- 5. kept procurement scheduler RPCs still exist (expect 2 rows)
select proname from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('invoke_procurement_sync_scheduler','invoke_procurement_archive_scheduler');
