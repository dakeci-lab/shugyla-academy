-- Complete flexible RBAC: roles, permissions, role_permissions
-- Idempotent. Safe to re-run. Does not delete existing data.

-- Prevent concurrent execution (avoids deadlock on repeated runs)
select pg_advisory_xact_lock(202607121630);

-- ---------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------

create or replace function academy_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function rbac_role_display_name(p_code text)
returns text language plpgsql immutable as $$
declare
  v_code text := lower(trim(coalesce(p_code, '')));
begin
  if v_code = '' then return 'Роль'; end if;
  return case v_code
    when 'admin' then 'Администратор'
    when 'administrator' then 'Администратор'
    when 'cashier' then 'Кассир'
    when 'seller' then 'Продавец'
    when 'cashier_seller' then 'Кассир-продавец'
    when 'purchaser' then 'Закупщик'
    when 'buyer' then 'Закупщик'
    when 'procurement' then 'Закупщик'
    when 'receiver' then 'Приёмщик'
    when 'floor_admin' then 'Администратор торгового зала'
    when 'manager' then 'Руководитель'
    else initcap(replace(replace(v_code, '_', ' '), '-', ' '))
  end;
end;
$$;

create or replace function rbac_is_system_role(p_code text)
returns boolean language sql immutable as $$
  select lower(trim(coalesce(p_code, ''))) in (
    'admin', 'administrator', 'purchaser', 'buyer', 'procurement',
    'receiver', 'floor_admin', 'cashier', 'seller', 'cashier_seller', 'manager'
  );
$$;

create or replace function rbac_role_description(p_code text)
returns text language plpgsql immutable as $$
declare v_code text := lower(trim(coalesce(p_code, '')));
begin
  return case v_code
    when 'admin' then 'Полный доступ ко всем разделам платформы.'
    when 'administrator' then 'Полный доступ ко всем разделам платформы.'
    when 'purchaser' then 'Закуп, приёмка, поставщики и ценники.'
    when 'buyer' then 'Закуп, приёмка, поставщики и ценники.'
    when 'procurement' then 'Закуп, приёмка, поставщики и ценники.'
    when 'receiver' then 'Приёмка товара и ценники.'
    when 'floor_admin' then 'Рейтинг, ценники, график и Academy.'
    when 'cashier' then 'Рейтинг, обучение и личный график.'
    when 'seller' then 'Рейтинг, обучение и личный график.'
    when 'cashier_seller' then 'Касса и продажи: рейтинг, обучение и график.'
    when 'manager' then 'Управление командой, график и рейтинг.'
    else ''
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  module text not null,
  action text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index if not exists idx_roles_code on roles(code);
create index if not exists idx_roles_active on roles(is_active);
create index if not exists idx_role_permissions_role on role_permissions(role_id);
create index if not exists idx_role_permissions_permission on role_permissions(permission_id);
create index if not exists idx_permissions_module on permissions(module, sort_order);

drop trigger if exists roles_updated_at on roles;
create trigger roles_updated_at
  before update on roles
  for each row execute function academy_set_updated_at();

alter table academy_users add column if not exists role_id uuid;
create index if not exists idx_academy_users_role_id on academy_users(role_id);

-- ---------------------------------------------------------------------------
-- 2. Seed permissions
-- ---------------------------------------------------------------------------

insert into permissions (code, name, description, module, action, sort_order) values
  ('dashboard.view', 'Главная платформа', 'Тайм-трекер и главная страница', 'dashboard', 'view', 10),
  ('employees.view', 'Просмотр сотрудников', 'Список и карточки сотрудников', 'employees', 'view', 20),
  ('employees.create', 'Создание сотрудников', 'Добавление новых сотрудников', 'employees', 'create', 21),
  ('employees.edit', 'Редактирование сотрудников', 'Изменение данных сотрудников', 'employees', 'edit', 22),
  ('employees.deactivate', 'Деактивация сотрудников', 'Деактивация и восстановление', 'employees', 'deactivate', 23),
  ('employees.delete', 'Удаление сотрудников', 'Безвозвратное удаление', 'employees', 'delete', 24),
  ('employees.manage_roles', 'Назначение ролей', 'Изменение роли сотрудника', 'employees', 'manage_roles', 25),
  ('roles.view', 'Просмотр ролей', 'Список ролей и прав', 'roles', 'view', 30),
  ('roles.create', 'Создание ролей', 'Создание новых ролей', 'roles', 'create', 31),
  ('roles.edit', 'Редактирование ролей', 'Изменение названия и описания', 'roles', 'edit', 32),
  ('roles.delete', 'Удаление ролей', 'Удаление пользовательских ролей', 'roles', 'delete', 33),
  ('roles.assign_permissions', 'Назначение разрешений', 'Изменение прав роли', 'roles', 'assign_permissions', 34),
  ('schedule.view_team', 'График команды', 'Просмотр графика всех сотрудников', 'schedule', 'view_team', 40),
  ('schedule.view_own', 'Свой график', 'Просмотр собственного графика', 'schedule', 'view_own', 41),
  ('schedule.edit', 'Редактирование графика', 'Назначение и изменение смен', 'schedule', 'edit', 42),
  ('schedule.bulk_edit', 'Массовое редактирование', 'Массовое назначение смен', 'schedule', 'bulk_edit', 43),
  ('attendance.view', 'Просмотр посещаемости', 'Статус смены и отметки', 'attendance', 'view', 50),
  ('attendance.check_in', 'Отметка прихода', 'Check-in на рабочей точке', 'attendance', 'check_in', 51),
  ('attendance.check_out', 'Отметка ухода', 'Check-out на рабочей точке', 'attendance', 'check_out', 52),
  ('rating.view', 'Рейтинг сотрудников', 'Просмотр рейтинга', 'rating', 'view', 60),
  ('recruitment.view', 'Раздел HR', 'Доступ к модулю HR', 'recruitment', 'view', 70),
  ('recruitment.manage_vacancies', 'Управление вакансиями', 'Создание и редактирование вакансий', 'recruitment', 'manage_vacancies', 71),
  ('recruitment.manage_candidates', 'Управление кандидатами', 'Обработка кандидатов', 'recruitment', 'manage_candidates', 72),
  ('recruitment.invite_candidate', 'Приглашение кандидата', 'Отправка приглашений', 'recruitment', 'invite_candidate', 73),
  ('recruitment.hire_candidate', 'Приём кандидата', 'Создание сотрудника из кандидата', 'recruitment', 'hire_candidate', 74),
  ('academy.view', 'Academy', 'Обучение и курсы', 'academy', 'view', 80),
  ('academy.manage_courses', 'Управление курсами', 'Курсы, уроки и тесты', 'academy', 'manage_courses', 81),
  ('academy.assign_courses', 'Назначение обучения', 'Назначение курсов сотрудникам', 'academy', 'assign_courses', 82),
  ('standards.view', 'Стандарты', 'Просмотр базы знаний', 'standards', 'view', 90),
  ('standards.manage', 'Редактирование стандартов', 'Управление статьями', 'standards', 'manage', 91),
  ('procurement.view', 'Просмотр закупок', 'Список закупок', 'procurement', 'view', 100),
  ('procurement.create', 'Создание закупки', 'Создание закупок', 'procurement', 'create', 101),
  ('procurement.edit', 'Редактирование закупки', 'Изменение закупок', 'procurement', 'edit', 102),
  ('procurement.delete', 'Удаление закупки', 'Удаление закупок', 'procurement', 'delete', 103),
  ('procurement.transfer', 'Передача в приёмку', 'Передача в приёмку', 'procurement', 'transfer', 104),
  ('receiving.view', 'Просмотр приёмки', 'Документы приёмки', 'receiving', 'view', 110),
  ('receiving.manage', 'Управление приёмкой', 'Оформление приёмки', 'receiving', 'manage', 111),
  ('suppliers.view', 'Просмотр поставщиков', 'Список поставщиков', 'suppliers', 'view', 120),
  ('suppliers.create', 'Создание поставщиков', 'Добавление поставщиков', 'suppliers', 'create', 121),
  ('suppliers.edit', 'Редактирование поставщиков', 'Изменение поставщиков', 'suppliers', 'edit', 122),
  ('suppliers.delete', 'Удаление поставщиков', 'Удаление поставщиков', 'suppliers', 'delete', 123),
  ('price_tags.view', 'Просмотр ценников', 'Доступ к ценникам', 'price_tags', 'view', 130),
  ('price_tags.manage', 'Управление ценниками', 'Настройка печати ценников', 'price_tags', 'manage', 131),
  ('payroll.view', 'Просмотр зарплат', 'Раздел подсчёта зарплаты', 'payroll', 'view', 140),
  ('payroll.calculate', 'Расчёт зарплаты', 'Расчёт заработной платы', 'payroll', 'calculate', 141),
  ('payroll.manage_settings', 'Настройки зарплаты', 'Параметры расчёта', 'payroll', 'manage_settings', 142),
  ('finance.view', 'Просмотр финансов', 'Финансовые данные', 'finance', 'view', 150),
  ('finance.manage', 'Управление финансами', 'Изменение финансовых данных', 'finance', 'manage', 151),
  ('settings.view', 'Просмотр настроек', 'Страница настроек', 'settings', 'view', 160),
  ('settings.manage', 'Управление настройками', 'Изменение настроек платформы', 'settings', 'manage', 161)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  module = excluded.module,
  action = excluded.action,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 3. Import roles from academy_users + system roles
-- ---------------------------------------------------------------------------

insert into roles (code, name, description, is_system, is_active)
select distinct
  trim(u.role),
  rbac_role_display_name(trim(u.role)),
  rbac_role_description(trim(u.role)),
  rbac_is_system_role(trim(u.role)),
  true
from academy_users u
where u.role is not null and trim(u.role) <> ''
on conflict (code) do nothing;

insert into roles (code, name, description, is_system, is_active) values
  ('admin', 'Администратор', 'Полный доступ ко всем разделам платформы.', true, true),
  ('purchaser', 'Закупщик', 'Закуп, приёмка, поставщики и ценники.', true, true),
  ('receiver', 'Приёмщик', 'Приёмка товара и ценники.', true, true),
  ('floor_admin', 'Администратор торгового зала', 'Рейтинг, ценники, график и Academy.', true, true),
  ('cashier', 'Кассир', 'Рейтинг, обучение и личный график.', true, true),
  ('seller', 'Продавец', 'Рейтинг, обучение и личный график.', true, true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_system = excluded.is_system;

-- Optional legacy import from platform_roles (dynamic SQL — table may not exist)
do $$
begin
  if to_regclass('public.platform_roles') is not null then
    execute $migration$
      insert into public.roles (id, code, name, description, is_system, is_active, created_at, updated_at)
      select pr.id, pr.slug, pr.name, pr.description, pr.is_system, true, pr.created_at, pr.updated_at
      from public.platform_roles pr
      on conflict (code) do nothing
    $migration$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Default role permissions (only if role has none yet)
-- ---------------------------------------------------------------------------

create or replace function rbac_grant_role_permissions(p_role_code text, p_permission_codes text[])
returns void language plpgsql as $$
declare
  v_role_id uuid;
  v_code text;
  v_perm_id uuid;
begin
  select id into v_role_id from roles where code = p_role_code;
  if v_role_id is null then return; end if;
  delete from role_permissions where role_id = v_role_id;
  foreach v_code in array p_permission_codes loop
    select id into v_perm_id from permissions where code = v_code;
    if v_perm_id is not null then
      insert into role_permissions (role_id, permission_id) values (v_role_id, v_perm_id)
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

create or replace function rbac_grant_role_permissions_if_empty(p_role_code text, p_permission_codes text[])
returns void language plpgsql as $$
declare v_role_id uuid;
begin
  select id into v_role_id from roles where code = p_role_code;
  if v_role_id is null then return; end if;
  if exists (select 1 from role_permissions where role_id = v_role_id) then return; end if;
  perform rbac_grant_role_permissions(p_role_code, p_permission_codes);
end;
$$;

select rbac_grant_role_permissions_if_empty(
  'admin',
  coalesce((select array_agg(code order by sort_order) from permissions), array[]::text[])
);
select rbac_grant_role_permissions_if_empty(
  'administrator',
  coalesce((select array_agg(code order by sort_order) from permissions), array[]::text[])
);

select rbac_grant_role_permissions_if_empty('purchaser', array[
  'dashboard.view', 'attendance.view', 'attendance.check_in', 'attendance.check_out',
  'schedule.view_own', 'rating.view',
  'procurement.view', 'procurement.create', 'procurement.edit', 'procurement.delete', 'procurement.transfer',
  'receiving.view', 'receiving.manage',
  'suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.delete',
  'price_tags.view', 'price_tags.manage',
  'academy.view', 'standards.view'
]);

select rbac_grant_role_permissions_if_empty('buyer', array[
  'dashboard.view', 'attendance.view', 'attendance.check_in', 'attendance.check_out',
  'schedule.view_own', 'rating.view',
  'procurement.view', 'procurement.create', 'procurement.edit', 'procurement.delete', 'procurement.transfer',
  'receiving.view', 'receiving.manage',
  'suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.delete',
  'price_tags.view', 'price_tags.manage',
  'academy.view', 'standards.view'
]);

select rbac_grant_role_permissions_if_empty('procurement', array[
  'dashboard.view', 'attendance.view', 'attendance.check_in', 'attendance.check_out',
  'schedule.view_own', 'rating.view',
  'procurement.view', 'procurement.create', 'procurement.edit', 'procurement.delete', 'procurement.transfer',
  'receiving.view', 'receiving.manage',
  'suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.delete',
  'price_tags.view', 'price_tags.manage',
  'academy.view', 'standards.view'
]);

select rbac_grant_role_permissions_if_empty('receiver', array[
  'dashboard.view', 'attendance.view', 'attendance.check_in', 'attendance.check_out',
  'schedule.view_own', 'rating.view',
  'receiving.view', 'receiving.manage', 'price_tags.view',
  'academy.view', 'standards.view'
]);

select rbac_grant_role_permissions_if_empty('floor_admin', array[
  'dashboard.view', 'attendance.view', 'attendance.check_in', 'attendance.check_out',
  'schedule.view_own', 'schedule.view_team', 'schedule.edit', 'rating.view',
  'price_tags.view', 'price_tags.manage',
  'academy.view', 'standards.view'
]);

select rbac_grant_role_permissions_if_empty('manager', array[
  'dashboard.view', 'attendance.view', 'attendance.check_in', 'attendance.check_out',
  'schedule.view_own', 'schedule.view_team', 'schedule.edit', 'rating.view',
  'employees.view', 'recruitment.view',
  'academy.view', 'standards.view'
]);

select rbac_grant_role_permissions_if_empty('cashier', array[
  'dashboard.view', 'attendance.view', 'attendance.check_in', 'attendance.check_out',
  'schedule.view_own', 'rating.view', 'academy.view', 'standards.view'
]);

select rbac_grant_role_permissions_if_empty('seller', array[
  'dashboard.view', 'attendance.view', 'attendance.check_in', 'attendance.check_out',
  'schedule.view_own', 'rating.view', 'academy.view', 'standards.view'
]);

select rbac_grant_role_permissions_if_empty('cashier_seller', array[
  'dashboard.view', 'attendance.view', 'attendance.check_in', 'attendance.check_out',
  'schedule.view_own', 'rating.view', 'academy.view', 'standards.view'
]);

-- Unknown roles: minimal safe access
do $$
declare r record;
begin
  for r in
    select id, code from roles
    where not exists (select 1 from role_permissions rp where rp.role_id = roles.id)
  loop
    perform rbac_grant_role_permissions(r.code, array[
      'dashboard.view', 'attendance.view', 'attendance.check_in', 'attendance.check_out',
      'schedule.view_own', 'academy.view', 'standards.view'
    ]);
  end loop;
end $$;

-- Optional legacy import from platform_role_permissions (dynamic SQL — tables may not exist)
do $$
begin
  if to_regclass('public.platform_role_permissions') is not null
     and to_regclass('public.platform_permissions') is not null then
    execute $migration$
      insert into public.role_permissions (role_id, permission_id)
      select prp.role_id, p.id
      from public.platform_role_permissions prp
      join public.platform_permissions pp on pp.id = prp.permission_id
      join public.permissions p on p.code = pp.slug
      on conflict do nothing
    $migration$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Backfill academy_users.role_id
-- ---------------------------------------------------------------------------

update academy_users u set role_id = r.id
from roles r
where r.code = trim(u.role)
  and (u.role_id is null or u.role_id <> r.id);

alter table academy_users drop constraint if exists academy_users_role_id_fkey;
alter table academy_users
  add constraint academy_users_role_id_fkey
  foreign key (role_id) references roles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 6. RPC helpers and write functions
-- ---------------------------------------------------------------------------

create or replace function rbac_current_user_role_code()
returns text language sql stable security definer set search_path = public as $$
  select u.role
  from academy_users u
  join auth.users au on au.id = auth.uid()
  where u.login = split_part(au.email, '@', 1)
  limit 1;
$$;

create or replace function rbac_assert_can_manage_roles()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_role_id uuid;
  v_has_perm boolean;
begin
  if auth.uid() is null then
    raise exception 'Требуется авторизация';
  end if;

  v_role := rbac_current_user_role_code();
  if v_role in ('admin', 'administrator') then
    return;
  end if;

  select r.id into v_role_id from roles r where r.code = v_role;
  if v_role_id is not null then
    select exists (
      select 1 from role_permissions rp
      join permissions p on p.id = rp.permission_id
      where rp.role_id = v_role_id
        and p.code in ('roles.edit', 'roles.assign_permissions', 'roles.create')
    ) into v_has_perm;
    if v_has_perm then return; end if;
  end if;

  raise exception 'Недостаточно прав для управления ролями';
end;
$$;

create or replace function rbac_assert_admin_role_protected(p_role_id uuid, p_permission_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_has_roles_view boolean;
  v_has_roles_assign boolean;
  v_has_settings_manage boolean;
begin
  select code into v_code from roles where id = p_role_id;
  if v_code not in ('admin', 'administrator') then
    return;
  end if;

  select exists (
    select 1 from unnest(coalesce(p_permission_ids, array[]::uuid[])) pid
    join permissions p on p.id = pid
    where p.code = 'roles.view'
  ) into v_has_roles_view;

  select exists (
    select 1 from unnest(coalesce(p_permission_ids, array[]::uuid[])) pid
    join permissions p on p.id = pid
    where p.code = 'roles.assign_permissions'
  ) into v_has_roles_assign;

  select exists (
    select 1 from unnest(coalesce(p_permission_ids, array[]::uuid[])) pid
    join permissions p on p.id = pid
    where p.code = 'settings.manage'
  ) into v_has_settings_manage;

  if not (v_has_roles_view and v_has_roles_assign and v_has_settings_manage) then
    raise exception 'У роли администратора должны остаться права управления ролями и настройками';
  end if;
end;
$$;

create or replace function rbac_save_role_permissions(p_role_id uuid, p_permission_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform rbac_assert_can_manage_roles();
  perform rbac_assert_admin_role_protected(p_role_id, p_permission_ids);
  delete from role_permissions where role_id = p_role_id;
  if p_permission_ids is not null then
    insert into role_permissions (role_id, permission_id)
    select p_role_id, unnest(p_permission_ids)
    on conflict do nothing;
  end if;
end;
$$;

create or replace function rbac_create_role(
  p_code text, p_name text, p_description text default '', p_permission_ids uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform rbac_assert_can_manage_roles();
  insert into roles (code, name, description, is_system, is_active)
  values (p_code, p_name, coalesce(p_description, ''), false, true)
  returning id into v_id;
  perform rbac_save_role_permissions(v_id, p_permission_ids);
  return v_id;
end;
$$;

create or replace function rbac_update_role(
  p_role_id uuid,
  p_name text,
  p_description text default '',
  p_is_active boolean default true,
  p_permission_ids uuid[] default '{}'
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_active_admin_count integer;
begin
  perform rbac_assert_can_manage_roles();

  select code into v_code from roles where id = p_role_id;
  if v_code is null then
    raise exception 'Роль не найдена';
  end if;

  if p_is_active = false and v_code in ('admin', 'administrator') then
    raise exception 'Системную роль администратора нельзя деактивировать';
  end if;

  if p_is_active = false then
    select count(*) into v_active_admin_count
    from roles r
    where r.is_active = true
      and r.code in ('admin', 'administrator')
      and r.id <> p_role_id;
    if v_active_admin_count = 0 and v_code in ('admin', 'administrator') then
      raise exception 'Нельзя деактивировать последнюю активную административную роль';
    end if;
  end if;

  update roles
  set name = p_name,
      description = coalesce(p_description, ''),
      is_active = coalesce(p_is_active, true),
      updated_at = now()
  where id = p_role_id;

  perform rbac_save_role_permissions(p_role_id, p_permission_ids);
end;
$$;

create or replace function rbac_duplicate_role(
  p_source_role_id uuid, p_code text, p_name text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_perm_ids uuid[]; v_description text;
begin
  perform rbac_assert_can_manage_roles();
  select array_agg(permission_id) into v_perm_ids from role_permissions where role_id = p_source_role_id;
  select description into v_description from roles where id = p_source_role_id;
  v_id := rbac_create_role(p_code, p_name, coalesce(v_description, ''), v_perm_ids);
  return v_id;
end;
$$;

create or replace function rbac_set_role_active(p_role_id uuid, p_is_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  perform rbac_assert_can_manage_roles();
  select code into v_code from roles where id = p_role_id;
  if v_code is null then raise exception 'Роль не найдена'; end if;
  if p_is_active = false and v_code in ('admin', 'administrator') then
    raise exception 'Системную роль администратора нельзя деактивировать';
  end if;
  update roles set is_active = p_is_active where id = p_role_id;
end;
$$;

grant execute on function rbac_save_role_permissions(uuid, uuid[]) to authenticated;
grant execute on function rbac_create_role(text, text, text, uuid[]) to authenticated;
grant execute on function rbac_update_role(uuid, text, text, boolean, uuid[]) to authenticated;
grant execute on function rbac_duplicate_role(uuid, text, text) to authenticated;
grant execute on function rbac_set_role_active(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------

alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;

drop policy if exists "roles_select" on roles;
create policy "roles_select" on roles for select using (true);

drop policy if exists "permissions_select" on permissions;
create policy "permissions_select" on permissions for select using (true);

drop policy if exists "role_permissions_select" on role_permissions;
create policy "role_permissions_select" on role_permissions for select using (true);

notify pgrst, 'reload schema';
