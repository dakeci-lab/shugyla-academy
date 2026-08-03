-- Stage 7B preflight — READ ONLY
-- Run immediately before applying drop_academy_learning.sql.draft
-- Manual checklist (not SQL):
--   [ ] Backup dir ~/secure-backups/shugyla-platform/20260802T231625Z exists
--   [ ] shasum -a 256 -c SHA256SUMS OK
--   [ ] Owner confirmed no external Academy apps / BI / scripts
--   [ ] Frontend still revision without learning table consumers

\set ON_ERROR_STOP on

-- Exact counts (expect: 7,36,1,0,1,2,0,1,2,0)
select 'academy_courses' as tbl, count(*)::bigint as n from public.academy_courses
union all select 'academy_lessons', count(*) from public.academy_lessons
union all select 'academy_course_assignments', count(*) from public.academy_course_assignments
union all select 'academy_progress', count(*) from public.academy_progress
union all select 'academy_tests', count(*) from public.academy_tests
union all select 'academy_test_questions', count(*) from public.academy_test_questions
union all select 'academy_test_attempts', count(*) from public.academy_test_attempts
union all select 'academy_learning_paths', count(*) from public.academy_learning_paths
union all select 'academy_learning_path_courses', count(*) from public.academy_learning_path_courses
union all select 'academy_user_learning_paths', count(*) from public.academy_user_learning_paths
order by 1;

-- Inbound FK from non-learning (must be 0 rows)
with learning as (
  select unnest(array[
    'academy_courses','academy_lessons','academy_course_assignments','academy_progress',
    'academy_tests','academy_test_questions','academy_test_attempts',
    'academy_learning_paths','academy_learning_path_courses','academy_user_learning_paths'
  ]) as tbl
)
select src.relname as source_table, tgt.relname as target_table, con.conname,
       pg_get_constraintdef(con.oid) as def
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_namespace nsrc on nsrc.oid = src.relnamespace and nsrc.nspname = 'public'
join pg_class tgt on tgt.oid = con.confrelid
join pg_namespace ntgt on ntgt.oid = tgt.relnamespace and ntgt.nspname = 'public'
where con.contype = 'f'
  and tgt.relname in (select tbl from learning)
  and src.relname not in (select tbl from learning);

-- Views
select dependent_ns.nspname || '.' || dependent_view.relname as view_name,
       source_table.relname as depends_on
from pg_depend
join pg_rewrite on pg_depend.objid = pg_rewrite.oid
join pg_class as dependent_view on pg_rewrite.ev_class = dependent_view.oid
join pg_class as source_table on pg_depend.refobjid = source_table.oid
join pg_namespace dependent_ns on dependent_ns.oid = dependent_view.relnamespace
join pg_namespace source_ns on source_ns.oid = source_table.relnamespace
where source_ns.nspname = 'public'
  and dependent_view.relkind = 'v'
  and source_table.relname in (
    'academy_courses','academy_lessons','academy_course_assignments','academy_progress',
    'academy_tests','academy_test_questions','academy_test_attempts',
    'academy_learning_paths','academy_learning_path_courses','academy_user_learning_paths'
  );

-- Functions mentioning learning tables (exclude none expected)
select n.nspname || '.' || p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname <> 'academy_set_updated_at'
  and pg_get_functiondef(p.oid) ~ 'academy_(courses|lessons|course_assignments|progress|tests|test_questions|test_attempts|learning_paths|learning_path_courses|user_learning_paths)';

-- Realtime
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in (
    'academy_courses','academy_lessons','academy_course_assignments','academy_progress',
    'academy_tests','academy_test_questions','academy_test_attempts',
    'academy_learning_paths','academy_learning_path_courses','academy_user_learning_paths'
  );

-- Permissions (expect three codes; links 7/1/1)
select p.code,
       (select count(*) from public.role_permissions rp where rp.permission_id = p.id) as role_links
from public.permissions p
where p.code in ('academy.view','academy.manage_courses','academy.assign_courses','academy.manage','academy.assign')
order by 1;

-- Preserve
select to_regclass('public.academy_users') as academy_users,
       to_regclass('public.academy_employee_shifts') as academy_employee_shifts,
       to_regclass('public.academy_vacancies') as academy_vacancies,
       to_regclass('public.academy_candidates') as academy_candidates,
       to_regclass('public.academy_candidate_questions') as academy_candidate_questions,
       to_regclass('public.academy_standard_categories') as academy_standard_categories,
       to_regclass('public.academy_standard_articles') as academy_standard_articles,
       to_regclass('public.academy_standard_article_reads') as academy_standard_article_reads,
       to_regprocedure('public.academy_set_updated_at()') as academy_set_updated_at;

select code from public.permissions
where code in ('standards.view','standards.manage')
order by 1;

-- Shared function consumers (must remain after DROP of learning triggers)
select c.relname as table_name, t.tgname as trigger_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname = 'public'
  and p.proname = 'academy_set_updated_at'
order by 1, 2;

-- Recent writes on learning tables (informational)
select 'academy_courses' as tbl, max(updated_at) as max_updated from public.academy_courses
union all select 'academy_lessons', max(updated_at) from public.academy_lessons
union all select 'academy_progress', max(updated_at) from public.academy_progress
union all select 'academy_tests', max(updated_at) from public.academy_tests
union all select 'academy_learning_paths', max(updated_at) from public.academy_learning_paths;
