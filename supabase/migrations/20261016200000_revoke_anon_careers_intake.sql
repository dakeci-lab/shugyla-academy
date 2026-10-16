-- Stage 13a: close the public careers intake in the database.
--
-- The careers site was retired in stage 12 (frontend redirects to the corporate
-- site), but the functions behind the public application flow stayed executable
-- by the anonymous role. Without a site nobody legitimately calls them, so they
-- are only an open write path (submit application, open photo upload sessions).
--
-- Only `anon` loses access. `authenticated` and `service_role` keep EXECUTE, so
-- admin tooling and any later cleanup are unaffected. Tables were already closed
-- by RLS (anon can only read published vacancies).
--
-- Rollback (restores the public flow at the DB level):
--   grant execute on function public.submit_candidate_application(uuid, jsonb, integer, uuid, uuid) to anon;
--   grant execute on function public.submit_candidate_application(uuid, jsonb, integer, uuid) to anon;
--   grant execute on function public.create_candidate_photo_upload_session(uuid, integer, text) to anon;
--   grant execute on function public.cancel_candidate_photo_upload_session(uuid) to anon;
--   grant execute on function public.get_public_vacancy_application_form(text) to anon;
--   grant execute on function public.list_published_vacancies_for_apply() to anon;

select pg_advisory_xact_lock(202610162000);

revoke execute on function public.submit_candidate_application(uuid, jsonb, integer, uuid, uuid) from anon;
revoke execute on function public.submit_candidate_application(uuid, jsonb, integer, uuid) from anon;
revoke execute on function public.create_candidate_photo_upload_session(uuid, integer, text) from anon;
revoke execute on function public.cancel_candidate_photo_upload_session(uuid) from anon;
revoke execute on function public.get_public_vacancy_application_form(text) from anon;
revoke execute on function public.list_published_vacancies_for_apply() from anon;
