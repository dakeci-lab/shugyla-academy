-- Shugyla Academy — Supabase schema
-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

-- Users / employees
create table if not exists academy_users (
  id bigint primary key,
  first_name text not null default '',
  last_name text not null default '',
  full_name text not null default '',
  login text not null unique,
  password text not null default '',
  role text not null default 'cashier',
  position text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Courses
create table if not exists academy_courses (
  id bigint primary key,
  title text not null default '',
  description text not null default '',
  category text not null default 'cashier',
  role text not null default 'cashier',
  status text not null default 'draft',
  duration_hours numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- App compatibility fields
  allowed_roles jsonb not null default '[]'::jsonb,
  duration_label text not null default '—',
  image_color text not null default '#2d8f4e',
  blocks_count integer not null default 1
);

-- Lessons
create table if not exists academy_lessons (
  id bigint primary key,
  course_id bigint not null references academy_courses(id) on delete cascade,
  title text not null default '',
  description text not null default '',
  video_url text not null default '',
  duration_minutes integer not null default 15,
  summary text not null default '',
  mandatory boolean not null default true,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- App compatibility
  block_id bigint,
  is_deleted boolean not null default false
);

-- Course assignments (manual course access)
create table if not exists academy_course_assignments (
  id bigint generated always as identity primary key,
  user_id bigint not null references academy_users(id) on delete cascade,
  course_id bigint not null references academy_courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, course_id)
);

-- Learning progress (lesson completion + optional test metadata)
create table if not exists academy_progress (
  id bigint generated always as identity primary key,
  user_id bigint not null references academy_users(id) on delete cascade,
  course_id bigint not null references academy_courses(id) on delete cascade,
  lesson_id bigint,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  test_passed boolean,
  test_score integer,
  unique (user_id, course_id, lesson_id)
);

create index if not exists idx_academy_lessons_course on academy_lessons(course_id);
create index if not exists idx_academy_assignments_user on academy_course_assignments(user_id);
create index if not exists idx_academy_progress_user on academy_progress(user_id);
create index if not exists idx_academy_progress_course on academy_progress(course_id);

-- Auto-update updated_at
create or replace function academy_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists academy_users_updated_at on academy_users;
create trigger academy_users_updated_at
  before update on academy_users for each row execute function academy_set_updated_at();

drop trigger if exists academy_courses_updated_at on academy_courses;
create trigger academy_courses_updated_at
  before update on academy_courses for each row execute function academy_set_updated_at();

drop trigger if exists academy_lessons_updated_at on academy_lessons;
create trigger academy_lessons_updated_at
  before update on academy_lessons for each row execute function academy_set_updated_at();

drop trigger if exists academy_progress_updated_at on academy_progress;
create trigger academy_progress_updated_at
  before update on academy_progress for each row execute function academy_set_updated_at();

-- RLS: allow anon access for academy app (adjust for production auth)
alter table academy_users enable row level security;
alter table academy_courses enable row level security;
alter table academy_lessons enable row level security;
alter table academy_course_assignments enable row level security;
alter table academy_progress enable row level security;

create policy "Allow anon read write academy_users"
  on academy_users for all using (true) with check (true);

create policy "Allow anon read write academy_courses"
  on academy_courses for all using (true) with check (true);

create policy "Allow anon read write academy_lessons"
  on academy_lessons for all using (true) with check (true);

create policy "Allow anon read write academy_course_assignments"
  on academy_course_assignments for all using (true) with check (true);

create policy "Allow anon read write academy_progress"
  on academy_progress for all using (true) with check (true);

-- Tests and attestation
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
