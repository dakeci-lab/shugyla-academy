-- Stage 13d APPLY — drop personnel / HR / careers / notification tables and their functions.
-- DESTRUCTIVE and NOT reversible from this repo: owner decided (2026-10-16) to delete WITHOUT archive.
-- No CASCADE anywhere: if anything unexpected still depends on an object the statement fails and the
-- whole transaction rolls back. Run preflight.sql first; run postcheck.sql after.

begin;

set local lock_timeout = '5s';
select pg_advisory_xact_lock(202610170001);

-- 1. the disabled per-minute time-tracker cron job
select cron.unschedule(jobid) from cron.job where jobname = 'time-tracker-notification-scheduler-every-minute';

-- 2. tables (one statement, so mutual foreign keys inside the set are fine)
drop table
  public.salary_allowances,
  public.salary_deductions,
  public.salary_records,
  public.salary_periods,
  public.notification_deliveries,
  public.notification_push_subscriptions,
  public.notification_preferences,
  public.notification_rules,
  public.notification_templates,
  public.notification_test_send_permits,
  public.notification_test_broadcast_audits,
  public.notifications,
  public.employee_documents,
  public.academy_employee_shifts,
  public.platform_attendance_settings,
  public.recruitment_application_uploads,
  public.academy_candidates,
  public.academy_candidate_questions,
  public.academy_vacancies,
  public.academy_people;

-- 3. functions that only served the dropped tables (also no CASCADE)
drop function public.academy_candidates_maintain_current();
drop function public.academy_vacancies_seed_form_on_insert();
drop function public.academy_vacancies_sync_position_snapshot();
drop function public.academy_vacancies_validate_publish();
drop function public.notification_deliveries_require_push_subscription();
drop function public.application_form_limits();
drop function public.application_form_normalize_options(jsonb);
drop function public.application_form_question_used(uuid, uuid);
drop function public.attendance_check_in(bigint, numeric, numeric, numeric);
drop function public.attendance_check_out(bigint, numeric, numeric, numeric);
drop function public.cancel_candidate_photo_upload_session(uuid);
drop function public.candidate_status_progress_rank(text);
drop function public.consume_notification_test_send_permit(uuid, bigint, uuid, uuid, uuid);
drop function public.create_candidate_photo_upload_session(uuid, integer, text);
drop function public.duplicate_vacancy_with_application_form(uuid);
drop function public.get_public_vacancy_application_form(text);
drop function public.invoke_time_tracker_notification_scheduler();
drop function public.issue_notification_test_send_permit(bigint, uuid, uuid);
drop function public.list_expired_unused_application_uploads(integer);
drop function public.list_published_vacancies_for_apply();
drop function public.mark_notification_read(uuid);
drop function public.recruitment_advisory_key(text);
drop function public.save_vacancy_application_form(uuid, jsonb, integer);
drop function public.seed_vacancy_application_form(uuid, boolean);
drop function public.submit_candidate_application(uuid, jsonb, integer, uuid, uuid);
drop function public.submit_candidate_application(uuid, jsonb, integer, uuid);
drop function public.validate_vacancy_application_form(uuid, boolean);

commit;
