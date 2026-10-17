-- Stage 18 preflight: only the columns' own CHECK constraints and FK should depend on them.
select 'fk_work_location (expect 1)', count(*) from pg_constraint where conrelid='public.academy_users'::regclass and contype='f' and conname='academy_users_work_location_id_fkey';
select 'views/functions/policies using the columns (expect 0)', (
  (select count(*) from pg_views where schemaname='public' and definition ~ 'work_mode|salary_calculation|payroll_participation|work_location_id') +
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc ~ 'work_mode|salary_calculation|payroll_participation|work_location_id') +
  (select count(*) from pg_policies where schemaname='public' and (coalesce(qual,'')||coalesce(with_check,'')) ~ 'work_mode|salary_calculation|payroll_participation|work_location_id'));
