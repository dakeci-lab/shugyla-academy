-- Stage 7B APPLY — executed only after successful preflight (owner-approved GO)
-- Kept under docs/db/ (not supabase/migrations/) so CI cannot auto-apply.
--
-- Live inventory (project cxadzerxndlscwvdaymk, verified 2026-08-02):
--   courses=7 lessons=36 assignments=1 progress=0 tests=1 questions=2
--   attempts=0 paths=1 path_courses=2 user_paths=0
--   permissions: academy.view (7 links), academy.manage_courses (1), academy.assign_courses (1)
--   aliases academy.manage / academy.assign: ABSENT
--
-- Backup required before apply:
--   ~/secure-backups/shugyla-platform/20260802T231625Z/
--   See SHA256SUMS in that directory.
--
-- MUST NOT DROP: academy_set_updated_at(), academy_users, shifts, HR, Standards,
--                standards.view / standards.manage, roles, non-learning permissions.

begin;

-- ---------------------------------------------------------------------------
-- 0) Safety: refuse if unexpected inbound FK from non-learning tables
-- ---------------------------------------------------------------------------
do $$
declare
  bad_count int;
begin
  with learning as (
    select unnest(array[
      'academy_courses','academy_lessons','academy_course_assignments','academy_progress',
      'academy_tests','academy_test_questions','academy_test_attempts',
      'academy_learning_paths','academy_learning_path_courses','academy_user_learning_paths'
    ]) as tbl
  )
  select count(*) into bad_count
  from pg_constraint con
  join pg_class src on src.oid = con.conrelid
  join pg_namespace nsrc on nsrc.oid = src.relnamespace and nsrc.nspname = 'public'
  join pg_class tgt on tgt.oid = con.confrelid
  join pg_namespace ntgt on ntgt.oid = tgt.relnamespace and ntgt.nspname = 'public'
  where con.contype = 'f'
    and tgt.relname in (select tbl from learning)
    and src.relname not in (select tbl from learning);

  if bad_count > 0 then
    raise exception 'ABORT: % inbound FK(s) from non-learning tables into learning tables', bad_count;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- A) RBAC cleanup — exact codes only (no academy.% wildcard)
-- ---------------------------------------------------------------------------
delete from public.role_permissions rp
using public.permissions p
where rp.permission_id = p.id
  and p.code in (
    'academy.view',
    'academy.manage_courses',
    'academy.assign_courses'
  );

delete from public.permissions
where code in (
  'academy.view',
  'academy.manage_courses',
  'academy.assign_courses'
);

-- ---------------------------------------------------------------------------
-- B) Realtime publication (no-op if not published)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'academy_test_attempts',
    'academy_test_questions',
    'academy_tests',
    'academy_user_learning_paths',
    'academy_learning_path_courses',
    'academy_learning_paths',
    'academy_progress',
    'academy_course_assignments',
    'academy_lessons',
    'academy_courses'
  ]
  loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- C) DROP TABLE — FK-safe order, NO CASCADE
--    Indexes / table policies / table triggers drop with the table.
-- ---------------------------------------------------------------------------
drop table if exists public.academy_test_attempts;
drop table if exists public.academy_test_questions;
drop table if exists public.academy_tests;

drop table if exists public.academy_user_learning_paths;
drop table if exists public.academy_learning_path_courses;
drop table if exists public.academy_learning_paths;

drop table if exists public.academy_progress;
drop table if exists public.academy_course_assignments;
drop table if exists public.academy_lessons;
drop table if exists public.academy_courses;

-- Do NOT: drop function public.academy_set_updated_at();

-- ---------------------------------------------------------------------------
-- D) Post-drop assertions (same transaction)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.academy_users') is null then
    raise exception 'ABORT: academy_users missing';
  end if;
  if to_regclass('public.academy_employee_shifts') is null then
    raise exception 'ABORT: academy_employee_shifts missing';
  end if;
  if to_regclass('public.academy_standard_articles') is null then
    raise exception 'ABORT: academy_standard_articles missing';
  end if;
  if to_regprocedure('public.academy_set_updated_at()') is null then
    raise exception 'ABORT: academy_set_updated_at() missing';
  end if;
  if exists (
    select 1 from public.permissions
    where code in ('academy.view','academy.manage_courses','academy.assign_courses')
  ) then
    raise exception 'ABORT: learning permission codes still present';
  end if;
  if not exists (select 1 from public.permissions where code = 'standards.view') then
    raise exception 'ABORT: standards.view missing';
  end if;
  if not exists (select 1 from public.permissions where code = 'standards.manage') then
    raise exception 'ABORT: standards.manage missing';
  end if;
  if to_regclass('public.academy_courses') is not null then
    raise exception 'ABORT: academy_courses still present';
  end if;
end $$;

commit;

-- After commit: run postcheck.sql
