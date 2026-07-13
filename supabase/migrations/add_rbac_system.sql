-- DEPRECATED: do not execute. Use 20260712163000_complete_flexible_rbac.sql
-- RBAC: роли, права и связи role_permissions
-- Сохраняем academy_users.role (text) для обратной совместимости

create table if not exists platform_roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists platform_permissions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  category text not null default 'general',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists platform_role_permissions (
  role_id uuid not null references platform_roles(id) on delete cascade,
  permission_id uuid not null references platform_permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create index if not exists idx_platform_role_permissions_role
  on platform_role_permissions(role_id);

create index if not exists idx_platform_role_permissions_permission
  on platform_role_permissions(permission_id);

create index if not exists idx_platform_permissions_category
  on platform_permissions(category, sort_order);

alter table academy_users
  add column if not exists role_id uuid references platform_roles(id) on delete set null;

create index if not exists idx_academy_users_role_id
  on academy_users(role_id);

-- updated_at для ролей
drop trigger if exists platform_roles_updated_at on platform_roles;
create trigger platform_roles_updated_at
  before update on platform_roles
  for each row execute function academy_set_updated_at();

-- Seed permissions
insert into platform_permissions (slug, name, description, category, sort_order) values
  ('platform.home', 'Главная платформы', 'Доступ к главной странице платформы', 'platform', 10),
  ('employees.view', 'Просмотр сотрудников', 'Список и карточки сотрудников', 'employees', 20),
  ('employees.edit', 'Редактирование сотрудников', 'Создание, изменение и деактивация сотрудников', 'employees', 21),
  ('employees.schedule.view_team', 'График команды', 'Просмотр графика всех сотрудников', 'employees', 22),
  ('employees.schedule.view_own', 'Свой график', 'Просмотр собственного графика', 'employees', 23),
  ('employees.schedule.edit', 'Редактирование графика', 'Назначение и изменение смен', 'employees', 24),
  ('employees.rating.view', 'Рейтинг сотрудников', 'Просмотр рейтинга', 'employees', 25),
  ('employees.payroll.view', 'Просмотр зарплат', 'Доступ к разделу зарплат', 'employees', 26),
  ('hr.vacancies.view', 'Просмотр вакансий', 'Список вакансий HR', 'hr', 30),
  ('hr.vacancies.edit', 'Редактирование вакансий', 'Создание и изменение вакансий', 'hr', 31),
  ('hr.candidates.view', 'Просмотр кандидатов', 'Список кандидатов', 'hr', 32),
  ('hr.candidates.edit', 'Редактирование кандидатов', 'Обработка кандидатов', 'hr', 33),
  ('procurement.view', 'Просмотр закупок', 'Список закупок', 'procurement', 40),
  ('procurement.create', 'Создание закупки', 'Создание новых закупок', 'procurement', 41),
  ('procurement.edit', 'Редактирование закупки', 'Изменение закупок', 'procurement', 42),
  ('procurement.delete', 'Удаление закупки', 'Удаление закупок', 'procurement', 43),
  ('procurement.transfer', 'Передача в приёмку', 'Передача закупки в приёмку', 'procurement', 44),
  ('receiving.view', 'Просмотр приёмки', 'Документы приёмки', 'receiving', 50),
  ('receiving.receive', 'Приём товара', 'Оформление приёмки', 'receiving', 51),
  ('suppliers.view', 'Просмотр поставщиков', 'Список поставщиков', 'suppliers', 60),
  ('suppliers.edit', 'Редактирование поставщиков', 'Создание и изменение поставщиков', 'suppliers', 61),
  ('suppliers.archive', 'Архив поставщиков', 'Архивирование поставщиков', 'suppliers', 62),
  ('suppliers.delete', 'Удаление поставщиков', 'Удаление поставщиков', 'suppliers', 63),
  ('price_tags.view', 'Ценники', 'Доступ к ценникам', 'procurement', 45),
  ('academy.view', 'Academy', 'Обучение и курсы', 'academy', 70),
  ('academy.manage', 'Управление Academy', 'Курсы, тесты и материалы', 'academy', 71),
  ('academy.assign', 'Назначение обучения', 'Назначение курсов сотрудникам', 'academy', 72),
  ('standards.view', 'Стандарты', 'Просмотр базы знаний', 'standards', 80),
  ('standards.manage', 'Редактирование стандартов', 'Управление статьями стандартов', 'standards', 81),
  ('settings.view', 'Настройки', 'Просмотр настроек платформы', 'settings', 90),
  ('settings.manage', 'Управление настройками', 'Изменение настроек платформы', 'settings', 91),
  ('roles.manage', 'Управление ролями', 'Настройка ролей и прав доступа', 'settings', 92),
  ('users.manage', 'Управление пользователями', 'Администрирование учётных записей', 'settings', 93),
  ('finance.view', 'Просмотр финансов', 'Финансовые данные и зарплаты', 'finance', 100)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  sort_order = excluded.sort_order;

-- Seed system roles
insert into platform_roles (slug, name, description, is_system) values
  ('admin', 'Админ', 'Полный доступ ко всем разделам платформы.', true),
  ('purchaser', 'Закупщик', 'Закуп, приёмка, поставщики и ценники.', true),
  ('receiver', 'Приёмщик', 'Приёмка товара и ценники.', true),
  ('floor_admin', 'Администратор торгового зала', 'Рейтинг сотрудников, ценники и Academy.', true),
  ('cashier', 'Кассир', 'Рейтинг и обучение.', true),
  ('seller', 'Продавец', 'Рейтинг и обучение.', true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  is_system = excluded.is_system;

-- Helper: grant permissions to role by slugs
create or replace function platform_grant_role_permissions(p_role_slug text, p_permission_slugs text[])
returns void
language plpgsql
as $$
declare
  v_role_id uuid;
  v_perm_slug text;
  v_perm_id uuid;
begin
  select id into v_role_id from platform_roles where slug = p_role_slug;
  if v_role_id is null then
    raise exception 'Role not found: %', p_role_slug;
  end if;

  delete from platform_role_permissions where role_id = v_role_id;

  foreach v_perm_slug in array p_permission_slugs loop
    select id into v_perm_id from platform_permissions where slug = v_perm_slug;
    if v_perm_id is not null then
      insert into platform_role_permissions (role_id, permission_id)
      values (v_role_id, v_perm_id)
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

-- Admin: all permissions
select platform_grant_role_permissions('admin', array(
  select slug from platform_permissions order by sort_order
));

-- Purchaser
select platform_grant_role_permissions('purchaser', array[
  'platform.home',
  'employees.schedule.view_own', 'employees.rating.view',
  'procurement.view', 'procurement.create', 'procurement.edit', 'procurement.delete', 'procurement.transfer',
  'receiving.view',
  'suppliers.view', 'suppliers.edit', 'suppliers.archive', 'suppliers.delete',
  'price_tags.view',
  'academy.view', 'standards.view'
]);

-- Receiver
select platform_grant_role_permissions('receiver', array[
  'platform.home',
  'employees.schedule.view_own', 'employees.rating.view',
  'receiving.view', 'receiving.receive',
  'price_tags.view',
  'academy.view', 'standards.view'
]);

-- Floor admin
select platform_grant_role_permissions('floor_admin', array[
  'platform.home',
  'employees.schedule.view_own', 'employees.rating.view',
  'price_tags.view',
  'academy.view', 'standards.view'
]);

-- Cashier & Seller
select platform_grant_role_permissions('cashier', array[
  'platform.home',
  'employees.schedule.view_own', 'employees.rating.view',
  'academy.view', 'standards.view'
]);

select platform_grant_role_permissions('seller', array[
  'platform.home',
  'employees.schedule.view_own', 'employees.rating.view',
  'academy.view', 'standards.view'
]);

-- Backfill role_id from legacy role text
update academy_users u
set role_id = r.id
from platform_roles r
where u.role_id is null
  and r.slug = u.role;

update academy_users u
set role_id = r.id
from platform_roles r
where u.role_id is null
  and u.role = 'buyer'
  and r.slug = 'purchaser';

-- RLS (как у остальных platform_* таблиц)
alter table platform_roles enable row level security;
alter table platform_permissions enable row level security;
alter table platform_role_permissions enable row level security;

drop policy if exists "Allow anon read write platform_roles" on platform_roles;
create policy "Allow anon read write platform_roles"
  on platform_roles for all using (true) with check (true);

drop policy if exists "Allow anon read write platform_permissions" on platform_permissions;
create policy "Allow anon read write platform_permissions"
  on platform_permissions for all using (true) with check (true);

drop policy if exists "Allow anon read write platform_role_permissions" on platform_role_permissions;
create policy "Allow anon read write platform_role_permissions"
  on platform_role_permissions for all using (true) with check (true);

drop function if exists platform_grant_role_permissions(text, text[]);
