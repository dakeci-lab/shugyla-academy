-- Migration: standards knowledge base (база стандартов)

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
