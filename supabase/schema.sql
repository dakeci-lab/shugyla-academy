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

-- Learning paths (обучающие маршруты)
create table if not exists academy_learning_paths (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  role text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists academy_learning_path_courses (
  id uuid primary key default gen_random_uuid(),
  learning_path_id uuid not null references academy_learning_paths(id) on delete cascade,
  course_id bigint not null references academy_courses(id) on delete cascade,
  sort_order integer not null default 0,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (learning_path_id, course_id)
);

create table if not exists academy_user_learning_paths (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references academy_users(id) on delete cascade,
  learning_path_id uuid not null references academy_learning_paths(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by bigint references academy_users(id),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled'))
);

create index if not exists idx_learning_paths_role on academy_learning_paths(role);
create index if not exists idx_learning_paths_status on academy_learning_paths(status);
create index if not exists idx_learning_path_courses_path on academy_learning_path_courses(learning_path_id);
create index if not exists idx_learning_path_courses_course on academy_learning_path_courses(course_id);
create index if not exists idx_user_learning_paths_user on academy_user_learning_paths(user_id);
create index if not exists idx_user_learning_paths_path on academy_user_learning_paths(learning_path_id);

drop trigger if exists academy_learning_paths_updated_at on academy_learning_paths;
create trigger academy_learning_paths_updated_at
  before update on academy_learning_paths for each row execute function academy_set_updated_at();

alter table academy_learning_paths enable row level security;
alter table academy_learning_path_courses enable row level security;
alter table academy_user_learning_paths enable row level security;

create policy "Allow anon read write academy_learning_paths"
  on academy_learning_paths for all using (true) with check (true);

create policy "Allow anon read write academy_learning_path_courses"
  on academy_learning_path_courses for all using (true) with check (true);

create policy "Allow anon read write academy_user_learning_paths"
  on academy_user_learning_paths for all using (true) with check (true);

-- Standards knowledge base (база стандартов)
create table if not exists academy_standard_categories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists academy_standard_articles (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references academy_standard_categories(id) on delete set null,
  title text not null,
  slug text unique,
  excerpt text,
  content text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  visibility_roles jsonb not null default '[]'::jsonb,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'important', 'critical')),
  created_by bigint references academy_users(id),
  updated_by bigint references academy_users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists academy_standard_article_reads (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references academy_standard_articles(id) on delete cascade,
  user_id bigint not null references academy_users(id) on delete cascade,
  read_at timestamptz not null default now(),
  acknowledged boolean not null default false,
  acknowledged_at timestamptz,
  unique (article_id, user_id)
);

create index if not exists idx_standard_articles_category on academy_standard_articles(category_id);
create index if not exists idx_standard_articles_status on academy_standard_articles(status);
create index if not exists idx_standard_articles_priority on academy_standard_articles(priority);
create index if not exists idx_standard_articles_slug on academy_standard_articles(slug);
create index if not exists idx_standard_article_reads_article on academy_standard_article_reads(article_id);
create index if not exists idx_standard_article_reads_user on academy_standard_article_reads(user_id);

drop trigger if exists academy_standard_categories_updated_at on academy_standard_categories;
create trigger academy_standard_categories_updated_at
  before update on academy_standard_categories for each row execute function academy_set_updated_at();

drop trigger if exists academy_standard_articles_updated_at on academy_standard_articles;
create trigger academy_standard_articles_updated_at
  before update on academy_standard_articles for each row execute function academy_set_updated_at();

alter table academy_standard_categories enable row level security;
alter table academy_standard_articles enable row level security;
alter table academy_standard_article_reads enable row level security;

create policy "Allow anon read write academy_standard_categories"
  on academy_standard_categories for all using (true) with check (true);

create policy "Allow anon read write academy_standard_articles"
  on academy_standard_articles for all using (true) with check (true);

create policy "Allow anon read write academy_standard_article_reads"
  on academy_standard_article_reads for all using (true) with check (true);

-- Recruitment module (найм)
create table if not exists academy_vacancies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  description text,
  role text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  passing_score integer not null default 80,
  created_by bigint references academy_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists academy_candidate_questions (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid not null references academy_vacancies(id) on delete cascade,
  question_text text not null,
  question_type text not null default 'single_choice',
  options jsonb not null default '[]'::jsonb,
  scores jsonb not null default '[]'::jsonb,
  required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists academy_candidates (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid references academy_vacancies(id) on delete set null,
  first_name text not null,
  last_name text,
  full_name text,
  phone text not null,
  age integer,
  city text,
  experience text,
  previous_work text,
  expected_salary text,
  available_from text,
  about text,
  answers jsonb not null default '{}'::jsonb,
  score_percent integer not null default 0,
  total_score integer not null default 0,
  max_score integer not null default 0,
  status text not null default 'new' check (status in (
    'new', 'suitable', 'maybe', 'rejected', 'invited',
    'interview_passed', 'trainee', 'hired'
  )),
  admin_notes text,
  created_user_id bigint references academy_users(id),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vacancies_status on academy_vacancies(status);
create index if not exists idx_vacancies_role on academy_vacancies(role);
create index if not exists idx_vacancies_slug on academy_vacancies(slug);
create index if not exists idx_candidate_questions_vacancy on academy_candidate_questions(vacancy_id);
create index if not exists idx_candidates_vacancy on academy_candidates(vacancy_id);
create index if not exists idx_candidates_status on academy_candidates(status);
create index if not exists idx_candidates_phone on academy_candidates(phone);
create index if not exists idx_candidates_submitted on academy_candidates(submitted_at);

drop trigger if exists academy_vacancies_updated_at on academy_vacancies;
create trigger academy_vacancies_updated_at
  before update on academy_vacancies for each row execute function academy_set_updated_at();

drop trigger if exists academy_candidate_questions_updated_at on academy_candidate_questions;
create trigger academy_candidate_questions_updated_at
  before update on academy_candidate_questions for each row execute function academy_set_updated_at();

drop trigger if exists academy_candidates_updated_at on academy_candidates;
create trigger academy_candidates_updated_at
  before update on academy_candidates for each row execute function academy_set_updated_at();

alter table academy_vacancies enable row level security;
alter table academy_candidate_questions enable row level security;
alter table academy_candidates enable row level security;

create policy "Allow anon read write academy_vacancies"
  on academy_vacancies for all using (true) with check (true);

create policy "Allow anon read write academy_candidate_questions"
  on academy_candidate_questions for all using (true) with check (true);

create policy "Allow anon read write academy_candidates"
  on academy_candidates for all using (true) with check (true);
