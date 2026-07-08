-- Migration: recruitment module (найм / фильтрация кандидатов)

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
  photo_url text,
  photo_path text,
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
