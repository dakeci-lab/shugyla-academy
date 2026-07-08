-- Migration: learning paths (обучающие маршруты)

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
