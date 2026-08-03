-- Stage 7B post-migration verification — READ ONLY
-- Expect learning objects gone; platform + Standards intact.

\set ON_ERROR_STOP on

-- Learning tables absent
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'academy_courses','academy_lessons','academy_course_assignments','academy_progress',
    'academy_tests','academy_test_questions','academy_test_attempts',
    'academy_learning_paths','academy_learning_path_courses','academy_user_learning_paths'
  );
-- expected: 0 rows

-- Learning permissions absent
select id, code from public.permissions
where code in ('academy.view','academy.manage_courses','academy.assign_courses');
-- expected: 0 rows

-- Orphan role_permissions
select rp.role_id, rp.permission_id
from public.role_permissions rp
left join public.permissions p on p.id = rp.permission_id
where p.id is null
limit 20;
-- expected: 0

-- Learning policies / indexes / triggers absent
select polname, tablename from pg_policies
where tablename in (
  'academy_courses','academy_lessons','academy_course_assignments','academy_progress',
  'academy_tests','academy_test_questions','academy_test_attempts',
  'academy_learning_paths','academy_learning_path_courses','academy_user_learning_paths'
);

select indexname, tablename from pg_indexes
where schemaname='public'
  and tablename in (
  'academy_courses','academy_lessons','academy_course_assignments','academy_progress',
  'academy_tests','academy_test_questions','academy_test_attempts',
  'academy_learning_paths','academy_learning_path_courses','academy_user_learning_paths'
);

select c.relname, t.tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and not t.tgisinternal
  and c.relname in (
  'academy_courses','academy_lessons','academy_course_assignments','academy_progress',
  'academy_tests','academy_test_questions','academy_test_attempts',
  'academy_learning_paths','academy_learning_path_courses','academy_user_learning_paths'
);

-- Realtime
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in (
    'academy_courses','academy_lessons','academy_course_assignments','academy_progress',
    'academy_tests','academy_test_questions','academy_test_attempts',
    'academy_learning_paths','academy_learning_path_courses','academy_user_learning_paths'
  );

-- Must preserve
select to_regclass('public.academy_users') is not null as has_users,
       to_regclass('public.academy_employee_shifts') is not null as has_shifts,
       to_regclass('public.academy_vacancies') is not null as has_vacancies,
       to_regclass('public.academy_candidates') is not null as has_candidates,
       to_regclass('public.academy_candidate_questions') is not null as has_candidate_questions,
       to_regclass('public.academy_standard_categories') is not null as has_std_cat,
       to_regclass('public.academy_standard_articles') is not null as has_std_art,
       to_regclass('public.academy_standard_article_reads') is not null as has_std_reads,
       to_regprocedure('public.academy_set_updated_at()') is not null as has_set_updated_at;

select code from public.permissions
where code in ('standards.view','standards.manage')
order by 1;

-- Shared function still used by non-learning tables
select count(*) as non_learning_updated_at_triggers
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname = 'public'
  and p.proname = 'academy_set_updated_at'
  and c.relname not like 'academy_course%'
  and c.relname not like 'academy_lesson%'
  and c.relname not like 'academy_progress%'
  and c.relname not like 'academy_test%'
  and c.relname not like 'academy_learning%'
  and c.relname not like 'academy_user_learning%';
-- expected: > 0
