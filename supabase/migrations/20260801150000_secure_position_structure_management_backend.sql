-- Stage 3A: secure backend for managing position groups and positions.
-- Additive only: permissions, SECURITY DEFINER RPCs, grants. No UI. No hard delete.

select pg_advisory_xact_lock(202608011500);

-- ---------------------------------------------------------------------------
-- Preflight (fail closed)
-- ---------------------------------------------------------------------------

do $$
declare
  v_users int;
  v_missing_pid int;
  v_orphans int;
  v_name_mismatch int;
  v_role_mismatch int;
  v_groups int;
  v_positions int;
  v_rpc_count int;
begin
  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = '20260801124500'
  ) then
    raise exception 'Stage 3A preflight failed: foundation migration 20260801124500 not applied';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = '20260801133000'
  ) then
    raise exception 'Stage 3A preflight failed: profile position access hotfix 20260801133000 not applied';
  end if;

  if to_regclass('public.position_groups') is null then
    raise exception 'Stage 3A preflight failed: public.position_groups missing';
  end if;

  if to_regclass('public.positions') is null then
    raise exception 'Stage 3A preflight failed: public.positions missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'academy_users'
      and column_name = 'position_id'
  ) then
    raise exception 'Stage 3A preflight failed: academy_users.position_id missing';
  end if;

  select count(*)::int into v_groups from public.position_groups;
  select count(*)::int into v_positions from public.positions;
  select count(*)::int into v_users from public.academy_users;
  select count(*)::int into v_missing_pid from public.academy_users where position_id is null;
  select count(*)::int into v_orphans
  from public.academy_users au
  where au.position_id is not null
    and not exists (select 1 from public.positions p where p.id = au.position_id);
  select count(*)::int into v_name_mismatch
  from public.academy_users au
  join public.positions p on p.id = au.position_id
  where au.position is distinct from p.name;
  select count(*)::int into v_role_mismatch
  from public.academy_users au
  join public.roles r on r.id = au.role_id
  where au.role is distinct from r.code;

  if v_groups < 1 then
    raise exception 'Stage 3A preflight failed: position_groups is empty';
  end if;
  if v_positions < 1 then
    raise exception 'Stage 3A preflight failed: positions is empty';
  end if;
  if v_missing_pid > 0 then
    raise exception 'Stage 3A preflight failed: % employees missing position_id', v_missing_pid;
  end if;
  if v_orphans > 0 then
    raise exception 'Stage 3A preflight failed: % orphan position_id values', v_orphans;
  end if;
  if v_name_mismatch > 0 then
    raise exception 'Stage 3A preflight failed: % legacy position name mismatches', v_name_mismatch;
  end if;
  if v_role_mismatch > 0 then
    raise exception 'Stage 3A preflight failed: % role/role_id mismatches', v_role_mismatch;
  end if;

  if exists (
    select 1 from public.permissions where code in ('positions.view', 'positions.manage')
  ) then
    raise exception 'Stage 3A preflight failed: positions.* permissions already exist';
  end if;

  select count(*)::int into v_rpc_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like 'position_structure_%';

  if v_rpc_count > 0 then
    raise exception 'Stage 3A preflight failed: position_structure_* RPCs already exist';
  end if;

  if not has_column_privilege('authenticated', 'public.academy_users', 'position_id', 'SELECT') then
    raise exception 'Stage 3A preflight failed: authenticated lacks SELECT on position_id';
  end if;

  if has_column_privilege('anon', 'public.academy_users', 'position_id', 'SELECT') then
    raise exception 'Stage 3A preflight failed: anon has SELECT on position_id';
  end if;

  if has_column_privilege('authenticated', 'public.academy_users', 'password', 'SELECT') then
    raise exception 'Stage 3A preflight failed: authenticated has SELECT on password';
  end if;

  raise notice
    'Stage 3A preflight OK: users=%, groups=%, positions=%',
    v_users, v_groups, v_positions;
end $$;

create temporary table stage3a_role_permissions_snapshot as
select role_id, permission_id
from public.role_permissions;

create temporary table stage3a_users_snapshot as
select id, position, position_id, role, role_id, status
from public.academy_users;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (code, name, description, module, action, sort_order)
values
  (
    'positions.view',
    'Просмотр организационной структуры',
    'Просмотр групп должностей, должностей и их порядка',
    'positions',
    'view',
    155
  ),
  (
    'positions.manage',
    'Управление организационной структурой',
    'Создание, редактирование, перемещение, архивирование и изменение порядка групп должностей и должностей',
    'positions',
    'manage',
    156
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  module = excluded.module,
  action = excluded.action,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'admin'
  and p.code in ('positions.view', 'positions.manage')
on conflict (role_id, permission_id) do nothing;

do $$
declare
  v_admin_role_id uuid;
  v_view_id uuid;
  v_manage_id uuid;
  v_extra_grants int;
begin
  select id into v_admin_role_id from public.roles where code = 'admin' limit 1;
  if v_admin_role_id is null then
    raise exception 'Stage 3A failed: admin role not found by code';
  end if;

  select id into v_view_id from public.permissions where code = 'positions.view';
  select id into v_manage_id from public.permissions where code = 'positions.manage';

  if v_view_id is null or v_manage_id is null then
    raise exception 'Stage 3A failed: positions.* permission rows missing after insert';
  end if;

  if not exists (
    select 1 from public.role_permissions
    where role_id = v_admin_role_id and permission_id = v_view_id
  ) then
    raise exception 'Stage 3A failed: admin missing positions.view';
  end if;

  if not exists (
    select 1 from public.role_permissions
    where role_id = v_admin_role_id and permission_id = v_manage_id
  ) then
    raise exception 'Stage 3A failed: admin missing positions.manage';
  end if;

  select count(*)::int into v_extra_grants
  from public.role_permissions rp
  join public.permissions p on p.id = rp.permission_id
  join public.roles r on r.id = rp.role_id
  where p.code in ('positions.view', 'positions.manage')
    and r.code is distinct from 'admin';

  if v_extra_grants > 0 then
    raise exception 'Stage 3A failed: non-admin roles unexpectedly received positions.*';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

create schema if not exists position_structure_private;

revoke all on schema position_structure_private from public;
revoke all on schema position_structure_private from anon;
revoke all on schema position_structure_private from authenticated;
grant usage on schema position_structure_private to postgres;
grant usage on schema position_structure_private to service_role;

create or replace function position_structure_private.raise_code(p_code text, p_detail text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_detail is null or btrim(p_detail) = '' then
    raise exception '%', p_code;
  end if;
  raise exception '%', p_code using detail = p_detail;
end;
$$;

create or replace function position_structure_private.assert_can_manage()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    perform position_structure_private.raise_code('position_structure_forbidden');
  end if;

  if not coalesce(auth_private.current_user_has_permission('positions.manage'), false) then
    perform position_structure_private.raise_code('position_structure_forbidden');
  end if;
end;
$$;

create or replace function position_structure_private.normalize_name(p_name text, p_kind text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    if p_kind = 'group' then
      perform position_structure_private.raise_code('invalid_group_name');
    else
      perform position_structure_private.raise_code('invalid_position_name');
    end if;
  end if;

  if v_name ~ '[[:cntrl:]]' then
    if p_kind = 'group' then
      perform position_structure_private.raise_code('invalid_group_name');
    else
      perform position_structure_private.raise_code('invalid_position_name');
    end if;
  end if;

  if char_length(v_name) > 150 then
    if p_kind = 'group' then
      perform position_structure_private.raise_code('invalid_group_name');
    else
      perform position_structure_private.raise_code('invalid_position_name');
    end if;
  end if;

  return v_name;
end;
$$;

create or replace function position_structure_private.normalize_description(p_description text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_description text;
begin
  if p_description is null then
    return null;
  end if;

  v_description := btrim(p_description);
  if v_description = '' then
    return null;
  end if;

  if v_description ~ '[[:cntrl:]]' or char_length(v_description) > 1000 then
    perform position_structure_private.raise_code('invalid_position_name');
  end if;

  return v_description;
end;
$$;

create or replace function position_structure_private.validate_sort_order(p_sort_order integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_sort_order is null then
    return null;
  end if;
  if p_sort_order < 0 or p_sort_order > 1000000 then
    perform position_structure_private.raise_code('invalid_sort_order');
  end if;
  return p_sort_order;
end;
$$;

create or replace function position_structure_private.next_group_sort_order()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_max integer;
begin
  select coalesce(max(g.sort_order), 0)
  into v_max
  from public.position_groups g
  where g.is_active = true;

  return ((v_max / 10) * 10) + 10;
end;
$$;

create or replace function position_structure_private.next_position_sort_order(p_group_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_max integer;
begin
  select coalesce(max(p.sort_order), 0)
  into v_max
  from public.positions p
  where p.group_id = p_group_id
    and p.is_active = true;

  return ((v_max / 10) * 10) + 10;
end;
$$;

create or replace function position_structure_private.group_to_json(p_group public.position_groups)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_group.id,
    'name', p_group.name,
    'description', p_group.description,
    'sort_order', p_group.sort_order,
    'is_active', p_group.is_active,
    'archived_at', p_group.archived_at,
    'created_at', p_group.created_at,
    'updated_at', p_group.updated_at
  );
$$;

create or replace function position_structure_private.position_to_json(p_position public.positions)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group public.position_groups;
begin
  select g.* into v_group
  from public.position_groups g
  where g.id = p_position.group_id;

  return jsonb_build_object(
    'id', p_position.id,
    'group_id', p_position.group_id,
    'name', p_position.name,
    'description', p_position.description,
    'sort_order', p_position.sort_order,
    'is_active', p_position.is_active,
    'archived_at', p_position.archived_at,
    'created_at', p_position.created_at,
    'updated_at', p_position.updated_at,
    'group_name', v_group.name,
    'group_sort_order', v_group.sort_order,
    'group_is_active', v_group.is_active
  );
end;
$$;

revoke all on function position_structure_private.raise_code(text, text) from public;
revoke all on function position_structure_private.raise_code(text, text) from anon;
revoke all on function position_structure_private.raise_code(text, text) from authenticated;
revoke all on function position_structure_private.assert_can_manage() from public;
revoke all on function position_structure_private.assert_can_manage() from anon;
revoke all on function position_structure_private.assert_can_manage() from authenticated;
revoke all on function position_structure_private.normalize_name(text, text) from public;
revoke all on function position_structure_private.normalize_name(text, text) from anon;
revoke all on function position_structure_private.normalize_name(text, text) from authenticated;
revoke all on function position_structure_private.normalize_description(text) from public;
revoke all on function position_structure_private.normalize_description(text) from anon;
revoke all on function position_structure_private.normalize_description(text) from authenticated;
revoke all on function position_structure_private.validate_sort_order(integer) from public;
revoke all on function position_structure_private.validate_sort_order(integer) from anon;
revoke all on function position_structure_private.validate_sort_order(integer) from authenticated;
revoke all on function position_structure_private.next_group_sort_order() from public;
revoke all on function position_structure_private.next_group_sort_order() from anon;
revoke all on function position_structure_private.next_group_sort_order() from authenticated;
revoke all on function position_structure_private.next_position_sort_order(uuid) from public;
revoke all on function position_structure_private.next_position_sort_order(uuid) from anon;
revoke all on function position_structure_private.next_position_sort_order(uuid) from authenticated;
revoke all on function position_structure_private.group_to_json(public.position_groups) from public;
revoke all on function position_structure_private.group_to_json(public.position_groups) from anon;
revoke all on function position_structure_private.group_to_json(public.position_groups) from authenticated;
revoke all on function position_structure_private.position_to_json(public.positions) from public;
revoke all on function position_structure_private.position_to_json(public.positions) from anon;
revoke all on function position_structure_private.position_to_json(public.positions) from authenticated;

-- ---------------------------------------------------------------------------
-- Public RPCs: groups
-- ---------------------------------------------------------------------------

create or replace function public.position_structure_create_group(
  p_name text,
  p_description text default null,
  p_sort_order integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_description text;
  v_sort_order integer;
  v_row public.position_groups;
begin
  perform position_structure_private.assert_can_manage();

  v_name := position_structure_private.normalize_name(p_name, 'group');
  v_description := position_structure_private.normalize_description(p_description);
  v_sort_order := position_structure_private.validate_sort_order(p_sort_order);
  if v_sort_order is null then
    v_sort_order := position_structure_private.next_group_sort_order();
  end if;

  begin
    insert into public.position_groups (name, description, sort_order, is_active, archived_at)
    values (v_name, v_description, v_sort_order, true, null)
    returning * into v_row;
  exception
    when unique_violation then
      perform position_structure_private.raise_code('position_group_duplicate_name');
  end;

  return position_structure_private.group_to_json(v_row);
end;
$$;

create or replace function public.position_structure_update_group(
  p_group_id uuid,
  p_name text,
  p_description text,
  p_sort_order integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_description text;
  v_sort_order integer;
  v_row public.position_groups;
begin
  perform position_structure_private.assert_can_manage();

  if p_group_id is null then
    perform position_structure_private.raise_code('invalid_position_group_id');
  end if;

  v_name := position_structure_private.normalize_name(p_name, 'group');
  v_description := position_structure_private.normalize_description(p_description);
  v_sort_order := position_structure_private.validate_sort_order(p_sort_order);
  if v_sort_order is null then
    perform position_structure_private.raise_code('invalid_sort_order');
  end if;

  select g.* into v_row
  from public.position_groups g
  where g.id = p_group_id
  for update;

  if not found then
    perform position_structure_private.raise_code('position_group_not_found');
  end if;

  begin
    update public.position_groups g
    set
      name = v_name,
      description = v_description,
      sort_order = v_sort_order
    where g.id = p_group_id
    returning * into v_row;
  exception
    when unique_violation then
      perform position_structure_private.raise_code('position_group_duplicate_name');
  end;

  return position_structure_private.group_to_json(v_row);
end;
$$;

create or replace function public.position_structure_set_group_active(
  p_group_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.position_groups;
  v_active_positions int;
begin
  perform position_structure_private.assert_can_manage();

  if p_group_id is null then
    perform position_structure_private.raise_code('invalid_position_group_id');
  end if;
  if p_is_active is null then
    perform position_structure_private.raise_code('invalid_reorder_payload');
  end if;

  select g.* into v_row
  from public.position_groups g
  where g.id = p_group_id
  for update;

  if not found then
    perform position_structure_private.raise_code('position_group_not_found');
  end if;

  if p_is_active then
    begin
      update public.position_groups g
      set
        is_active = true,
        archived_at = null
      where g.id = p_group_id
      returning * into v_row;
    exception
      when unique_violation then
        perform position_structure_private.raise_code('position_group_duplicate_name');
    end;
  else
    select count(*)::int into v_active_positions
    from public.positions p
    where p.group_id = p_group_id
      and p.is_active = true;

    if v_active_positions > 0 then
      perform position_structure_private.raise_code(
        'position_group_has_active_positions',
        v_active_positions::text
      );
    end if;

    update public.position_groups g
    set
      is_active = false,
      archived_at = now()
    where g.id = p_group_id
    returning * into v_row;
  end if;

  return position_structure_private.group_to_json(v_row);
end;
$$;

create or replace function public.position_structure_reorder_groups(
  p_group_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_active_ids uuid[];
  v_idx int;
  v_id uuid;
  v_rows jsonb := '[]'::jsonb;
  v_row public.position_groups;
begin
  perform position_structure_private.assert_can_manage();

  if p_group_ids is null or cardinality(p_group_ids) = 0 then
    perform position_structure_private.raise_code('invalid_reorder_payload');
  end if;

  if exists (select 1 from unnest(p_group_ids) as x(id) where x.id is null) then
    perform position_structure_private.raise_code('invalid_position_group_id');
  end if;

  select array_agg(x.id order by ord)
  into v_ids
  from unnest(p_group_ids) with ordinality as x(id, ord);

  if (
    select count(*) from unnest(v_ids) as d(id)
  ) <> (
    select count(distinct d.id) from unnest(v_ids) as d(id)
  ) then
    perform position_structure_private.raise_code('duplicate_reorder_id');
  end if;

  select coalesce(array_agg(g.id order by g.sort_order, g.name, g.id), array[]::uuid[])
  into v_active_ids
  from public.position_groups g
  where g.is_active = true;

  if cardinality(v_ids) <> cardinality(v_active_ids) then
    perform position_structure_private.raise_code('reorder_items_missing');
  end if;

  if exists (
    select 1
    from unnest(v_ids) as x(id)
    where not exists (
      select 1 from unnest(v_active_ids) as a(id) where a.id = x.id
    )
  ) then
    -- unknown, archived, or inactive ids
    if exists (
      select 1
      from unnest(v_ids) as x(id)
      where not exists (select 1 from public.position_groups g where g.id = x.id)
    ) then
      perform position_structure_private.raise_code('position_group_not_found');
    end if;
    if exists (
      select 1
      from unnest(v_ids) as x(id)
      join public.position_groups g on g.id = x.id
      where g.is_active = false
    ) then
      perform position_structure_private.raise_code('position_group_inactive');
    end if;
    perform position_structure_private.raise_code('reorder_items_missing');
  end if;

  -- Lock all active groups in stable order to avoid deadlocks.
  perform 1
  from public.position_groups g
  where g.is_active = true
  order by g.id
  for update;

  v_idx := 0;
  foreach v_id in array v_ids loop
    v_idx := v_idx + 1;
    update public.position_groups g
    set sort_order = v_idx * 10
    where g.id = v_id;
  end loop;

  for v_row in
    select g.*
    from public.position_groups g
    where g.is_active = true
    order by g.sort_order, g.name, g.id
  loop
    v_rows := v_rows || jsonb_build_array(position_structure_private.group_to_json(v_row));
  end loop;

  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs: positions
-- ---------------------------------------------------------------------------

create or replace function public.position_structure_create_position(
  p_group_id uuid,
  p_name text,
  p_description text default null,
  p_sort_order integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group public.position_groups;
  v_name text;
  v_description text;
  v_sort_order integer;
  v_row public.positions;
begin
  perform position_structure_private.assert_can_manage();

  if p_group_id is null then
    perform position_structure_private.raise_code('invalid_position_group_id');
  end if;

  select g.* into v_group
  from public.position_groups g
  where g.id = p_group_id
  for update;

  if not found then
    perform position_structure_private.raise_code('position_group_not_found');
  end if;

  if v_group.is_active is distinct from true then
    perform position_structure_private.raise_code('position_group_inactive');
  end if;

  v_name := position_structure_private.normalize_name(p_name, 'position');
  v_description := position_structure_private.normalize_description(p_description);
  v_sort_order := position_structure_private.validate_sort_order(p_sort_order);
  if v_sort_order is null then
    v_sort_order := position_structure_private.next_position_sort_order(p_group_id);
  end if;

  begin
    insert into public.positions (group_id, name, description, sort_order, is_active, archived_at)
    values (p_group_id, v_name, v_description, v_sort_order, true, null)
    returning * into v_row;
  exception
    when unique_violation then
      perform position_structure_private.raise_code('position_duplicate_name');
  end;

  return position_structure_private.position_to_json(v_row);
end;
$$;

create or replace function public.position_structure_update_position(
  p_position_id uuid,
  p_group_id uuid,
  p_name text,
  p_description text,
  p_sort_order integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.positions;
  v_group public.position_groups;
  v_name text;
  v_description text;
  v_sort_order integer;
  v_old_name text;
begin
  perform position_structure_private.assert_can_manage();

  if p_position_id is null then
    perform position_structure_private.raise_code('invalid_position_id');
  end if;
  if p_group_id is null then
    perform position_structure_private.raise_code('invalid_position_group_id');
  end if;

  select p.* into v_row
  from public.positions p
  where p.id = p_position_id
  for update;

  if not found then
    perform position_structure_private.raise_code('position_not_found');
  end if;

  -- Archived positions must be restored before edit/move.
  if v_row.is_active is distinct from true then
    perform position_structure_private.raise_code('position_inactive');
  end if;

  select g.* into v_group
  from public.position_groups g
  where g.id = p_group_id
  for update;

  if not found then
    perform position_structure_private.raise_code('position_group_not_found');
  end if;

  if v_group.is_active is distinct from true then
    perform position_structure_private.raise_code('position_target_group_inactive');
  end if;

  v_name := position_structure_private.normalize_name(p_name, 'position');
  v_description := position_structure_private.normalize_description(p_description);
  v_sort_order := position_structure_private.validate_sort_order(p_sort_order);
  if v_sort_order is null then
    perform position_structure_private.raise_code('invalid_sort_order');
  end if;

  v_old_name := v_row.name;

  begin
    update public.positions p
    set
      group_id = p_group_id,
      name = v_name,
      description = v_description,
      sort_order = v_sort_order
    where p.id = p_position_id
    returning * into v_row;
  exception
    when unique_violation then
      perform position_structure_private.raise_code('position_duplicate_name');
  end;

  -- Legacy sync: keep academy_users.position equal to positions.name for assigned employees.
  if v_old_name is distinct from v_name then
    update public.academy_users au
    set position = v_name
    where au.position_id = p_position_id;
  end if;

  return position_structure_private.position_to_json(v_row);
end;
$$;

create or replace function public.position_structure_set_position_active(
  p_position_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.positions;
  v_group public.position_groups;
  v_active_employees int;
begin
  perform position_structure_private.assert_can_manage();

  if p_position_id is null then
    perform position_structure_private.raise_code('invalid_position_id');
  end if;
  if p_is_active is null then
    perform position_structure_private.raise_code('invalid_reorder_payload');
  end if;

  select p.* into v_row
  from public.positions p
  where p.id = p_position_id
  for update;

  if not found then
    perform position_structure_private.raise_code('position_not_found');
  end if;

  if p_is_active then
    select g.* into v_group
    from public.position_groups g
    where g.id = v_row.group_id
    for update;

    if not found then
      perform position_structure_private.raise_code('position_group_not_found');
    end if;

    if v_group.is_active is distinct from true then
      perform position_structure_private.raise_code('position_parent_group_inactive');
    end if;

    begin
      update public.positions p
      set
        is_active = true,
        archived_at = null
      where p.id = p_position_id
      returning * into v_row;
    exception
      when unique_violation then
        perform position_structure_private.raise_code('position_duplicate_name');
    end;
  else
    select count(*)::int into v_active_employees
    from public.academy_users au
    where au.position_id = p_position_id
      and au.status = 'active';

    if v_active_employees > 0 then
      perform position_structure_private.raise_code(
        'position_has_active_employees',
        v_active_employees::text
      );
    end if;

    update public.positions p
    set
      is_active = false,
      archived_at = now()
    where p.id = p_position_id
    returning * into v_row;
  end if;

  return position_structure_private.position_to_json(v_row);
end;
$$;

create or replace function public.position_structure_reorder_positions(
  p_group_id uuid,
  p_position_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group public.position_groups;
  v_ids uuid[];
  v_active_ids uuid[];
  v_idx int;
  v_id uuid;
  v_rows jsonb := '[]'::jsonb;
  v_row public.positions;
begin
  perform position_structure_private.assert_can_manage();

  if p_group_id is null then
    perform position_structure_private.raise_code('invalid_position_group_id');
  end if;

  if p_position_ids is null or cardinality(p_position_ids) = 0 then
    perform position_structure_private.raise_code('invalid_reorder_payload');
  end if;

  if exists (select 1 from unnest(p_position_ids) as x(id) where x.id is null) then
    perform position_structure_private.raise_code('invalid_position_id');
  end if;

  select g.* into v_group
  from public.position_groups g
  where g.id = p_group_id
  for update;

  if not found then
    perform position_structure_private.raise_code('position_group_not_found');
  end if;

  select array_agg(x.id order by ord)
  into v_ids
  from unnest(p_position_ids) with ordinality as x(id, ord);

  if (
    select count(*) from unnest(v_ids) as d(id)
  ) <> (
    select count(distinct d.id) from unnest(v_ids) as d(id)
  ) then
    perform position_structure_private.raise_code('duplicate_reorder_id');
  end if;

  select coalesce(array_agg(p.id order by p.sort_order, p.name, p.id), array[]::uuid[])
  into v_active_ids
  from public.positions p
  where p.group_id = p_group_id
    and p.is_active = true;

  if cardinality(v_ids) <> cardinality(v_active_ids) then
    perform position_structure_private.raise_code('reorder_items_missing');
  end if;

  if exists (
    select 1
    from unnest(v_ids) as x(id)
    where not exists (
      select 1 from unnest(v_active_ids) as a(id) where a.id = x.id
    )
  ) then
    if exists (
      select 1
      from unnest(v_ids) as x(id)
      where not exists (select 1 from public.positions p where p.id = x.id)
    ) then
      perform position_structure_private.raise_code('position_not_found');
    end if;

    if exists (
      select 1
      from unnest(v_ids) as x(id)
      join public.positions p on p.id = x.id
      where p.group_id is distinct from p_group_id
    ) then
      perform position_structure_private.raise_code('reorder_foreign_item');
    end if;

    if exists (
      select 1
      from unnest(v_ids) as x(id)
      join public.positions p on p.id = x.id
      where p.is_active = false
    ) then
      perform position_structure_private.raise_code('position_inactive');
    end if;

    perform position_structure_private.raise_code('reorder_items_missing');
  end if;

  perform 1
  from public.positions p
  where p.group_id = p_group_id
    and p.is_active = true
  order by p.id
  for update;

  v_idx := 0;
  foreach v_id in array v_ids loop
    v_idx := v_idx + 1;
    update public.positions p
    set sort_order = v_idx * 10
    where p.id = v_id
      and p.group_id = p_group_id;
  end loop;

  for v_row in
    select p.*
    from public.positions p
    where p.group_id = p_group_id
      and p.is_active = true
    order by p.sort_order, p.name, p.id
  loop
    v_rows := v_rows || jsonb_build_array(position_structure_private.position_to_json(v_row));
  end loop;

  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- Comments + EXECUTE grants
-- ---------------------------------------------------------------------------

comment on function public.position_structure_create_group(text, text, integer) is
  'Create an active position group. Requires positions.manage. SECURITY DEFINER.';
comment on function public.position_structure_update_group(uuid, text, text, integer) is
  'Update name/description/sort_order of a position group. Does not change archive state.';
comment on function public.position_structure_set_group_active(uuid, boolean) is
  'Archive or restore a position group. Archive blocked when active positions exist.';
comment on function public.position_structure_reorder_groups(uuid[]) is
  'Full reorder of all active position groups. Assigns sort_order 10,20,30,...';
comment on function public.position_structure_create_position(uuid, text, text, integer) is
  'Create an active position in an active group. Does not create roles or assign employees.';
comment on function public.position_structure_update_position(uuid, uuid, text, text, integer) is
  'Update position fields and/or move between active groups. Renames sync legacy academy_users.position.';
comment on function public.position_structure_set_position_active(uuid, boolean) is
  'Archive or restore a position. Archive blocked when any active employee uses it.';
comment on function public.position_structure_reorder_positions(uuid, uuid[]) is
  'Full reorder of active positions inside one group. Assigns sort_order 10,20,30,...';

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'position_structure_%'
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('revoke all on function %s from anon', r.sig);
    execute format('revoke all on function %s from authenticated', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Post-checks (fail closed; rolls back whole migration)
-- ---------------------------------------------------------------------------

do $$
declare
  v_users_before int;
  v_users_after int;
  v_pid_changed int;
  v_role_changed int;
  v_legacy_mismatch int;
  v_rp_extra int;
  v_rp_missing int;
  v_rpc_count int;
  v_public_exec int;
  v_anon_exec int;
  v_auth_exec int;
  v_ins_pol int;
  v_upd_pol int;
  v_del_pol int;
begin
  select count(*)::int into v_users_before from stage3a_users_snapshot;
  select count(*)::int into v_users_after from public.academy_users;
  if v_users_before <> v_users_after then
    raise exception 'Stage 3A post-check failed: employee count changed';
  end if;

  select count(*)::int into v_pid_changed
  from public.academy_users au
  join stage3a_users_snapshot s on s.id = au.id
  where au.position_id is distinct from s.position_id
     or au.position is distinct from s.position;
  if v_pid_changed > 0 then
    raise exception 'Stage 3A post-check failed: employee position fields changed';
  end if;

  select count(*)::int into v_role_changed
  from public.academy_users au
  join stage3a_users_snapshot s on s.id = au.id
  where au.role is distinct from s.role
     or au.role_id is distinct from s.role_id;
  if v_role_changed > 0 then
    raise exception 'Stage 3A post-check failed: employee role fields changed';
  end if;

  select count(*)::int into v_legacy_mismatch
  from public.academy_users au
  join public.positions p on p.id = au.position_id
  where au.position is distinct from p.name;
  if v_legacy_mismatch > 0 then
    raise exception 'Stage 3A post-check failed: legacy position mismatch after migration';
  end if;

  -- Existing role_permissions rows (except new positions.* for admin) must be unchanged.
  select count(*)::int into v_rp_missing
  from stage3a_role_permissions_snapshot s
  where not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = s.role_id
      and rp.permission_id = s.permission_id
  );
  if v_rp_missing > 0 then
    raise exception 'Stage 3A post-check failed: existing role_permissions removed';
  end if;

  select count(*)::int into v_rp_extra
  from public.role_permissions rp
  join public.permissions p on p.id = rp.permission_id
  where not exists (
    select 1
    from stage3a_role_permissions_snapshot s
    where s.role_id = rp.role_id
      and s.permission_id = rp.permission_id
  )
  and p.code not in ('positions.view', 'positions.manage');
  if v_rp_extra > 0 then
    raise exception 'Stage 3A post-check failed: unexpected extra role_permissions';
  end if;

  select count(*)::int into v_rpc_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'position_structure_create_group',
      'position_structure_update_group',
      'position_structure_set_group_active',
      'position_structure_reorder_groups',
      'position_structure_create_position',
      'position_structure_update_position',
      'position_structure_set_position_active',
      'position_structure_reorder_positions'
    );
  if v_rpc_count <> 8 then
    raise exception 'Stage 3A post-check failed: expected 8 public RPCs, found %', v_rpc_count;
  end if;

  select count(*)::int into v_public_exec
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like 'position_structure_%'
    and has_function_privilege('public', p.oid, 'EXECUTE');
  if v_public_exec > 0 then
    raise exception 'Stage 3A post-check failed: PUBLIC still has EXECUTE on RPCs';
  end if;

  select count(*)::int into v_anon_exec
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like 'position_structure_%'
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_anon_exec > 0 then
    raise exception 'Stage 3A post-check failed: anon has EXECUTE on RPCs';
  end if;

  select count(*)::int into v_auth_exec
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like 'position_structure_%'
    and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_auth_exec <> 8 then
    raise exception 'Stage 3A post-check failed: authenticated EXECUTE count=%', v_auth_exec;
  end if;

  select count(*)::int into v_ins_pol
  from pg_policies
  where schemaname = 'public'
    and tablename in ('position_groups', 'positions')
    and cmd = 'INSERT';
  select count(*)::int into v_upd_pol
  from pg_policies
  where schemaname = 'public'
    and tablename in ('position_groups', 'positions')
    and cmd = 'UPDATE';
  select count(*)::int into v_del_pol
  from pg_policies
  where schemaname = 'public'
    and tablename in ('position_groups', 'positions')
    and cmd = 'DELETE';

  if v_ins_pol > 0 or v_upd_pol > 0 or v_del_pol > 0 then
    raise exception 'Stage 3A post-check failed: write policies present on position tables';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'position_groups'
      and policyname = 'position_groups_select_authenticated'
      and cmd = 'SELECT'
  ) then
    raise exception 'Stage 3A post-check failed: group SELECT policy missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'positions'
      and policyname = 'positions_select_authenticated'
      and cmd = 'SELECT'
  ) then
    raise exception 'Stage 3A post-check failed: positions SELECT policy missing';
  end if;

  -- Hard-delete RPCs must not exist.
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'position_structure_delete_group',
        'position_structure_delete_position',
        'position_structure_hard_delete_group',
        'position_structure_hard_delete_position'
      )
  ) then
    raise exception 'Stage 3A post-check failed: hard-delete RPC detected';
  end if;

  raise notice 'Stage 3A post-checks OK';
end $$;
