-- Migration: tests and final attestation
-- Run in Supabase SQL Editor after main schema

create table if not exists academy_tests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type text not null check (type in ('course_test', 'final_attestation')),
  course_id bigint references academy_courses(id) on delete set null,
  role text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  passing_score integer not null default 80,
  max_attempts integer,
  time_limit_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists academy_test_questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references academy_tests(id) on delete cascade,
  question_text text not null,
  question_type text not null default 'single_choice',
  options jsonb not null default '[]'::jsonb,
  correct_option_index integer not null default 0,
  explanation text,
  points integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists academy_test_attempts (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references academy_tests(id) on delete cascade,
  user_id bigint not null references academy_users(id) on delete cascade,
  course_id bigint references academy_courses(id) on delete set null,
  type text not null check (type in ('course_test', 'final_attestation')),
  answers jsonb not null default '{}'::jsonb,
  score_percent integer not null default 0,
  correct_count integer not null default 0,
  total_questions integer not null default 0,
  passed boolean not null default false,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_academy_tests_course on academy_tests(course_id);
create index if not exists idx_academy_tests_role on academy_tests(role);
create index if not exists idx_academy_test_questions_test on academy_test_questions(test_id);
create index if not exists idx_academy_test_attempts_user on academy_test_attempts(user_id);
create index if not exists idx_academy_test_attempts_test on academy_test_attempts(test_id);
create index if not exists idx_academy_test_attempts_course on academy_test_attempts(course_id);

drop trigger if exists academy_tests_updated_at on academy_tests;
create trigger academy_tests_updated_at
  before update on academy_tests for each row execute function academy_set_updated_at();

drop trigger if exists academy_test_questions_updated_at on academy_test_questions;
create trigger academy_test_questions_updated_at
  before update on academy_test_questions for each row execute function academy_set_updated_at();

alter table academy_tests enable row level security;
alter table academy_test_questions enable row level security;
alter table academy_test_attempts enable row level security;

create policy "Allow anon read write academy_tests"
  on academy_tests for all using (true) with check (true);

create policy "Allow anon read write academy_test_questions"
  on academy_test_questions for all using (true) with check (true);

create policy "Allow anon read write academy_test_attempts"
  on academy_test_attempts for all using (true) with check (true);
