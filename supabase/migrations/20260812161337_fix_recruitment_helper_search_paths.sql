-- Pin helper lookup paths after the production recruitment migration.
-- These helpers only use pg_catalog built-ins and expose no application schema.

alter function public.recruitment_advisory_key(text)
  set search_path = pg_catalog;

alter function public.normalize_kz_mobile_phone(text)
  set search_path = pg_catalog;

alter function public.candidate_status_progress_rank(text)
  set search_path = pg_catalog;
