-- Stage 1: additive foundation for organizational positions and groups.
-- Does not change frontend, Edge Functions, RBAC, or legacy academy_users.position text.

select pg_advisory_xact_lock(202608011245);

-- ---------------------------------------------------------------------------
-- Preflight (fail closed)
-- ---------------------------------------------------------------------------

do $$
declare
  v_users int;
  v_bad_position int;
  v_null_role_id int;
  v_mismatch int;
  v_extra_triggers int;
  v_norm_conflicts int;
  v_unknown_positions int;
  v_object_conflicts int;
begin
  if to_regclass('public.position_groups') is not null then
    raise exception
      'Stage 1 preflight failed: public.position_groups already exists';
  end if;

  if to_regclass('public.positions') is not null then
    raise exception
      'Stage 1 preflight failed: public.positions already exists';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'academy_users'
      and column_name = 'position_id'
  ) then
    raise exception
      'Stage 1 preflight failed: academy_users.position_id already exists';
  end if;

  select count(*)::int into v_object_conflicts
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and c.relname in ('position_groups', 'positions');

  if v_object_conflicts > 0 then
    raise exception
      'Stage 1 preflight failed: conflicting relation named position_groups/positions exists';
  end if;

  select count(*)::int into v_extra_triggers
  from pg_trigger
  where not tgisinternal
    and tgrelid = 'public.academy_users'::regclass
    and tgname <> 'academy_users_updated_at';

  if v_extra_triggers > 0 then
    raise exception
      'Stage 1 preflight failed: unexpected non-updated_at triggers on academy_users';
  end if;

  select count(*)::int into v_users from public.academy_users;

  select count(*)::int into v_bad_position
  from public.academy_users
  where position is null
     or btrim(position) = ''
     or position <> btrim(position);

  if v_bad_position > 0 then
    raise exception
      'Stage 1 preflight failed: % academy_users rows have null/empty/untrimmed position',
      v_bad_position;
  end if;

  select count(*)::int into v_null_role_id
  from public.academy_users
  where role_id is null;

  if v_null_role_id > 0 then
    raise exception
      'Stage 1 preflight failed: % academy_users rows have null role_id',
      v_null_role_id;
  end if;

  select count(*)::int into v_mismatch
  from public.academy_users au
  join public.roles r on r.id = au.role_id
  where au.role is distinct from r.code
     or au.position is distinct from r.name;

  if v_mismatch > 0 then
    raise exception
      'Stage 1 preflight failed: % academy_users rows mismatch roles.code/name',
      v_mismatch;
  end if;

  select count(*)::int into v_norm_conflicts
  from (
    select lower(btrim(position)) as norm
    from public.academy_users
    group by lower(btrim(position))
    having count(distinct position) > 1
  ) conflicts;

  if v_norm_conflicts > 0 then
    raise exception
      'Stage 1 preflight failed: normalized position collisions among current employees';
  end if;

  -- Every current employee position must be covered by the Stage 1 seed map.
  select count(*)::int into v_unknown_positions
  from (
    select distinct btrim(position) as position_name
    from public.academy_users
  ) current_positions
  where lower(current_positions.position_name) not in (
    lower('Администратор'),
    lower('Администратор торгового зала'),
    lower('Бухгалтер'),
    lower('Закупщик'),
    lower('Приёмщик'),
    lower('Кассир'),
    lower('Продавец'),
    lower('Техничка'),
    lower('Trainee'),
    lower('Тестовая роль RBAC — изменена')
  );

  if v_unknown_positions > 0 then
    raise exception
      'Stage 1 preflight failed: % unknown academy_users.position value(s) not in Stage 1 seed map',
      v_unknown_positions;
  end if;

  raise notice 'Stage 1 preflight OK: % academy_users rows ready for position backfill', v_users;
end $$;

-- Snapshot legacy fields for post-assertions (must run inside one transaction).
create temporary table stage1_academy_users_snapshot as
select id, position, role, role_id
from public.academy_users;

create temporary table stage1_roles_snapshot as
select id, code, name, is_active, updated_at
from public.roles;

create temporary table stage1_role_permissions_snapshot as
select role_id, permission_id
from public.role_permissions;

-- ---------------------------------------------------------------------------
-- position_groups
-- ---------------------------------------------------------------------------

create table public.position_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint position_groups_name_not_blank check (btrim(name) <> ''),
  constraint position_groups_sort_order_nonnegative check (sort_order >= 0),
  constraint position_groups_archived_implies_inactive check (
    archived_at is null or is_active = false
  )
);

create unique index position_groups_name_norm_uidx
  on public.position_groups (lower(btrim(name)));

create index position_groups_active_sort_idx
  on public.position_groups (is_active, sort_order, name);

comment on table public.position_groups is
  'Organizational groups for employee positions. Stage 1 foundation; write access via permission-controlled RPC/Edge will be added later.';
comment on column public.position_groups.name is
  'Display name of the group. Uniqueness is case/space-insensitive via expression index.';
comment on column public.position_groups.archived_at is
  'Soft-archive timestamp. When set, is_active must be false.';

drop trigger if exists position_groups_updated_at on public.position_groups;
create trigger position_groups_updated_at
  before update on public.position_groups
  for each row
  execute function public.academy_set_updated_at();

alter table public.position_groups enable row level security;

revoke all on table public.position_groups from public;
revoke all on table public.position_groups from anon;
revoke all on table public.position_groups from authenticated;
grant select on table public.position_groups to authenticated;
grant all on table public.position_groups to service_role;

drop policy if exists position_groups_select_authenticated on public.position_groups;
create policy position_groups_select_authenticated
  on public.position_groups
  for select
  to authenticated
  using (true);

comment on policy position_groups_select_authenticated on public.position_groups is
  'Stage 1 transitional read access for authenticated users. INSERT/UPDATE/DELETE via client PostgREST are intentionally denied; writes will be added later through permission-controlled RPC or Edge/API.';

-- ---------------------------------------------------------------------------
-- positions
-- ---------------------------------------------------------------------------

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.position_groups (id) on delete restrict,
  name text not null,
  description text null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positions_name_not_blank check (btrim(name) <> ''),
  constraint positions_sort_order_nonnegative check (sort_order >= 0),
  constraint positions_archived_implies_inactive check (
    archived_at is null or is_active = false
  )
);

create unique index positions_name_norm_uidx
  on public.positions (lower(btrim(name)));

create index positions_group_id_idx
  on public.positions (group_id);

create index positions_is_active_idx
  on public.positions (is_active);

create index positions_group_sort_name_idx
  on public.positions (group_id, sort_order, name);

comment on table public.positions is
  'Company job positions catalog. Independent from RBAC roles. Stage 1 foundation; write access via permission-controlled RPC/Edge will be added later.';
comment on column public.positions.name is
  'Display name of the position. Globally unique (normalized) in current single-tenant stage.';
comment on column public.positions.group_id is
  'Owning position group. Physical delete of a used group is blocked by ON DELETE RESTRICT.';

drop trigger if exists positions_updated_at on public.positions;
create trigger positions_updated_at
  before update on public.positions
  for each row
  execute function public.academy_set_updated_at();

alter table public.positions enable row level security;

revoke all on table public.positions from public;
revoke all on table public.positions from anon;
revoke all on table public.positions from authenticated;
grant select on table public.positions to authenticated;
grant all on table public.positions to service_role;

drop policy if exists positions_select_authenticated on public.positions;
create policy positions_select_authenticated
  on public.positions
  for select
  to authenticated
  using (true);

comment on policy positions_select_authenticated on public.positions is
  'Stage 1 transitional read access for authenticated users. INSERT/UPDATE/DELETE via client PostgREST are intentionally denied; writes will be added later through permission-controlled RPC or Edge/API.';

-- ---------------------------------------------------------------------------
-- academy_users.position_id (nullable additive FK)
-- ---------------------------------------------------------------------------

alter table public.academy_users
  add column position_id uuid null;

alter table public.academy_users
  add constraint academy_users_position_id_fkey
  foreign key (position_id)
  references public.positions (id)
  on delete restrict;

create index idx_academy_users_position_id
  on public.academy_users (position_id);

comment on column public.academy_users.position_id is
  'FK to public.positions. Nullable during Stage 1 coexistence with legacy text column academy_users.position. No sync trigger.';

-- ---------------------------------------------------------------------------
-- Seed groups and positions used by current employees
-- ---------------------------------------------------------------------------

with inserted_groups as (
  insert into public.position_groups (name, sort_order)
  values
    ('Административный состав', 10),
    ('Финансы', 20),
    ('Закуп, приёмка и склад', 30),
    ('Кассовая зона', 40),
    ('Торговый зал', 50),
    ('Хозяйственный персонал', 60),
    ('Стажёры', 70),
    ('Не распределено', 90)
  returning id, name
),
seed_positions (position_name, group_name, sort_order) as (
  values
    ('Администратор', 'Административный состав', 10),
    ('Администратор торгового зала', 'Административный состав', 20),
    ('Бухгалтер', 'Финансы', 10),
    ('Закупщик', 'Закуп, приёмка и склад', 10),
    ('Приёмщик', 'Закуп, приёмка и склад', 20),
    ('Кассир', 'Кассовая зона', 10),
    ('Продавец', 'Торговый зал', 10),
    ('Техничка', 'Хозяйственный персонал', 10),
    ('Trainee', 'Стажёры', 10),
    ('Тестовая роль RBAC — изменена', 'Не распределено', 10)
)
insert into public.positions (group_id, name, sort_order)
select g.id, sp.position_name, sp.sort_order
from seed_positions sp
join inserted_groups g on g.name = sp.group_name;

-- Only keep seed positions that are actually used by current employees.
-- This keeps the catalog tied to real data while still inserting the intended map
-- for every currently used value (asserted in preflight).
-- No-op filter retained for clarity / future hardening:
do $$
declare
  v_unused int;
begin
  select count(*)::int into v_unused
  from public.positions p
  where not exists (
    select 1
    from public.academy_users au
    where lower(btrim(au.position)) = lower(btrim(p.name))
  );

  -- Seed includes only currently used titles by design; fail if that invariant breaks.
  if v_unused > 0 then
    raise exception
      'Stage 1 seed failed: % seeded positions are unused by current academy_users.position',
      v_unused;
  end if;
end $$;

-- Pre-backfill: every employee maps to exactly one position.
do $$
declare
  v_unmapped int;
  v_ambiguous int;
begin
  select count(*)::int into v_unmapped
  from public.academy_users au
  where not exists (
    select 1
    from public.positions p
    where lower(btrim(p.name)) = lower(btrim(au.position))
  );

  if v_unmapped > 0 then
    raise exception
      'Stage 1 backfill aborted: % academy_users rows have no matching positions.name',
      v_unmapped;
  end if;

  select count(*)::int into v_ambiguous
  from (
    select au.id
    from public.academy_users au
    join public.positions p
      on lower(btrim(p.name)) = lower(btrim(au.position))
    group by au.id
    having count(*) <> 1
  ) bad;

  if v_ambiguous > 0 then
    raise exception
      'Stage 1 backfill aborted: % academy_users rows match zero or multiple positions',
      v_ambiguous;
  end if;
end $$;

update public.academy_users au
set position_id = p.id
from public.positions p
where lower(btrim(p.name)) = lower(btrim(au.position));

-- ---------------------------------------------------------------------------
-- Post-migration assertions
-- ---------------------------------------------------------------------------

do $$
declare
  v_users_before int;
  v_users_after int;
  v_missing_position_id int;
  v_orphan_position_id int;
  v_name_mismatch int;
  v_legacy_changed int;
  v_roles_changed int;
  v_role_permissions_changed int;
  v_groups int;
  v_positions int;
  v_buyer_dupes int;
  v_zakupschik_positions int;
begin
  select count(*)::int into v_users_before from stage1_academy_users_snapshot;
  select count(*)::int into v_users_after from public.academy_users;

  if v_users_before <> v_users_after then
    raise exception
      'Stage 1 postcheck failed: academy_users count changed (% -> %)',
      v_users_before, v_users_after;
  end if;

  select count(*)::int into v_missing_position_id
  from public.academy_users
  where position_id is null;

  if v_missing_position_id > 0 then
    raise exception
      'Stage 1 postcheck failed: % academy_users rows still have null position_id',
      v_missing_position_id;
  end if;

  select count(*)::int into v_orphan_position_id
  from public.academy_users au
  where au.position_id is not null
    and not exists (
      select 1 from public.positions p where p.id = au.position_id
    );

  if v_orphan_position_id > 0 then
    raise exception
      'Stage 1 postcheck failed: orphan position_id values present';
  end if;

  select count(*)::int into v_name_mismatch
  from public.academy_users au
  join public.positions p on p.id = au.position_id
  where au.position is distinct from p.name;

  if v_name_mismatch > 0 then
    raise exception
      'Stage 1 postcheck failed: % rows where academy_users.position <> positions.name',
      v_name_mismatch;
  end if;

  if exists (
    select 1
    from public.positions p
    where not exists (
      select 1 from public.position_groups g where g.id = p.group_id
    )
  ) then
    raise exception
      'Stage 1 postcheck failed: position without valid group_id';
  end if;

  select count(*)::int into v_legacy_changed
  from public.academy_users au
  join stage1_academy_users_snapshot s on s.id = au.id
  where au.position is distinct from s.position
     or au.role is distinct from s.role
     or au.role_id is distinct from s.role_id;

  if v_legacy_changed > 0 then
    raise exception
      'Stage 1 postcheck failed: legacy position/role/role_id changed for % rows',
      v_legacy_changed;
  end if;

  select count(*)::int into v_roles_changed
  from (
    select id, code, name, is_active, updated_at from public.roles
    except
    select id, code, name, is_active, updated_at from stage1_roles_snapshot
    union
    select id, code, name, is_active, updated_at from stage1_roles_snapshot
    except
    select id, code, name, is_active, updated_at from public.roles
  ) diff;

  if v_roles_changed > 0 then
    raise exception
      'Stage 1 postcheck failed: roles table changed';
  end if;

  select count(*)::int into v_role_permissions_changed
  from (
    select role_id, permission_id from public.role_permissions
    except
    select role_id, permission_id from stage1_role_permissions_snapshot
    union
    select role_id, permission_id from stage1_role_permissions_snapshot
    except
    select role_id, permission_id from public.role_permissions
  ) diff;

  if v_role_permissions_changed > 0 then
    raise exception
      'Stage 1 postcheck failed: role_permissions table changed';
  end if;

  select count(*)::int into v_groups from public.position_groups;
  if v_groups <> 8 then
    raise exception
      'Stage 1 postcheck failed: expected 8 position_groups, found %',
      v_groups;
  end if;

  select count(*)::int into v_positions from public.positions;
  if v_positions <> (
    select count(distinct lower(btrim(position)))::int from public.academy_users
  ) then
    raise exception
      'Stage 1 postcheck failed: positions count does not match distinct employee positions';
  end if;

  select count(*)::int into v_zakupschik_positions
  from public.positions
  where lower(btrim(name)) = lower('Закупщик');

  if v_zakupschik_positions <> 1 then
    raise exception
      'Stage 1 postcheck failed: expected exactly one position «Закупщик», found %',
      v_zakupschik_positions;
  end if;

  select count(*)::int into v_buyer_dupes
  from public.positions
  where lower(btrim(name)) = lower('Закупщик');

  if v_buyer_dupes <> 1 then
    raise exception
      'Stage 1 postcheck failed: duplicate Закупщик positions';
  end if;

  raise notice 'Stage 1 complete: % employees backfilled, % groups, % positions',
    v_users_after, v_groups, v_positions;
end $$;
